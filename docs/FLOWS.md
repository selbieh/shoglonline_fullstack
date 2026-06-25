# ShoghlOnline — Complete Two-User Flows (Visual)

> One account, two **modes** (`find_job` = Worker, `find_worker` = Employer). Mode is a **view toggle only — never authorization** (FR-MODE-4). All gating is relationship-based (contract party / resource owner).
>
> Render: open this file in the VS Code Markdown preview (Mermaid supported) or on GitHub.

## Legend of moderation toggles (decide live-vs-pending everywhere)

| Flag | Default | ON | OFF |
|---|---|---|---|
| `jobs.auto_publish` | **False** | Job → `PUBLISHED` + subscriber fanout | Job → `PENDING_REVIEW` (admin approves) |
| `proposals.auto_publish` | **True** | Proposal → `SUBMITTED` | Proposal → `PENDING_APPROVAL` (moderator passes) |
| `services.auto_publish` | **False** | Service → `LIVE` | Service → `PENDING_REVIEW` (admin approves) |
| `profiles.auto_publish` | **False** | Profile → `PUBLISHED` | Profile → `PENDING_REVIEW` (admin approves) |
| `profiles.publish_min_completeness` | **70** | Completeness gate to allow publishing. `80` = stricter; **`0` = publish all (no gate)** | Admin-tunable in GlobalSetting admin |
| `bids.enabled` | **True** | Proposal costs 1 bid; signup grants 10 | Proposals free; no grants/purchases |
| `payments.commission_pct` | **10%** | Frozen at contract creation (override by CommissionTier) | — |

---

## 1. Auth & Onboarding (new vs returning)

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend (/signin)
    participant API as POST /auth/google
    participant SVC as authenticate_google_user()
    participant G as Google verify
    participant DB as Postgres
    participant N as notify()

    U->>FE: Click "Sign in with Google"
    FE->>API: id_token
    API->>SVC: id_token, ip
    SVC->>G: verify_google_token()
    G-->>SVC: payload {sub,email,name,picture}

    alt User NOT found (NEW)
        SVC->>DB: registration.enabled?
        Note over SVC,DB: OFF → deny "registration_closed"
        SVC->>DB: create User (status=ACTIVE, active_mode="")
        SVC->>DB: grant_signup_bids() → +10 BidLedger SIGNUP_GRANT
        SVC->>N: welcome notif (force=true) "مرحبًا بك 👋"
        SVC-->>API: user, first_login=true
        API-->>FE: access+refresh JWT, first_login=true
        FE->>U: redirect /onboarding/mode
    else User found (RETURNING)
        Note over SVC: status=FROZEN → deny "account_frozen"<br/>status=DELETED → deny "account_deleted"
        SVC->>DB: last_login = now
        SVC-->>API: user, first_login=(active_mode empty)
        API-->>FE: access+refresh JWT
        FE->>U: redirect /dashboard
    end
```

### Onboarding branch by mode

```mermaid
flowchart TD
    M["/onboarding/mode<br/>PATCH /auth/me/mode"] -->|find_job| W["/onboarding/profile"]
    M -->|find_worker| E["/onboarding/employer"]

    W --> WP["GET/PATCH /me/profile<br/>(WorkerProfile lazy-created)"]
    WP --> WStep["Steps: identity, work, skills,<br/>languages, portfolio, certs,<br/>rate/availability, ID verify"]
    WStep --> Pub{"completeness ≥ profiles.publish_min_completeness?<br/>(default 70; 0 = publish all)<br/>8 checks: bio_title, overview, expertise,<br/>hourly_rate, skills, educations,<br/>employments, languages"}
    Pub -->|No| Block["400 profile_incomplete<br/>{required_pct, completeness_pct}"]
    Pub -->|Yes| Submit["POST /me/profile/publish"]
    Submit --> AP{"profiles.auto_publish?"}
    AP -->|ON| Live["publish_state=PUBLISHED"]
    AP -->|OFF| Pend["publish_state=PENDING_REVIEW<br/>→ admin approve/reject(reason)"]

    E --> EP["GET/PATCH /me/employer-profile<br/>(EmployerProfile lazy-created)<br/>company, field, country, city, tz, logo"]
    EP --> Ready["Ready to post jobs / buy services"]
```

> **Account deletion** (`DELETE /auth/me`): blocked (409) if open contracts, non-zero wallet, pending withdrawals, or pending service requests (BR-2). On success → soft-delete (status=DELETED), anonymize PII, close listings, lock chats; ledger retained; `google_sub` freed for re-register.

---

## 2. State machines

### Job

```mermaid
stateDiagram-v2
    [*] --> DRAFT: POST /me/jobs
    DRAFT --> PUBLISHED: jobs.auto_publish ON
    DRAFT --> PENDING_REVIEW: jobs.auto_publish OFF
    PENDING_REVIEW --> PUBLISHED: admin approve
    PENDING_REVIEW --> REJECTED: admin reject(reason)
    PUBLISHED --> IN_PROGRESS: proposal accepted
    PUBLISHED --> CLOSED: employer closes / expiry
    IN_PROGRESS --> COMPLETED: contract completed
    PUBLISHED --> SUSPENDED: owner frozen (BR-23)
    SUSPENDED --> PUBLISHED: unfrozen (restore prev)
    PUBLISHED --> ARCHIVED: report ACTIONED / soft-delete
    REJECTED --> [*]
    CLOSED --> [*]
    COMPLETED --> [*]
    ARCHIVED --> [*]
    note right of PUBLISHED
        title/description LOCKED
        once any proposal exists (BR-4)
        +expires_at = +30d if auto_archive
    end note
```

### Proposal

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: proposals.auto_publish ON
    [*] --> PENDING_APPROVAL: proposals.auto_publish OFF
    note left of SUBMITTED
        bid consumed at submission (-1)
        unless invited (free, BR-7)
    end note
    PENDING_APPROVAL --> SUBMITTED: moderator passes
    PENDING_APPROVAL --> REJECTED: moderator rejects → REFUND_MODERATION (+1 bid)
    SUBMITTED --> VIEWED: employer opens list
    VIEWED --> ACCEPTED: employer accepts → Contract created
    VIEWED --> REJECTED: employer rejects (NO refund)
    SUBMITTED --> CANCELLED: worker cancels (NO refund)
    SUBMITTED --> WITHDRAWN: job closed/expired → REFUND_JOB_CLOSED (+1 bid)
    SUBMITTED --> SUSPENDED: worker frozen (bid stays spent)
    ACCEPTED --> [*]
    REJECTED --> [*]
    CANCELLED --> [*]
    WITHDRAWN --> [*]
```

### Service & Buying Request

```mermaid
stateDiagram-v2
    state Service {
        [*] --> S_DRAFT: POST /me/services
        S_DRAFT --> LIVE: services.auto_publish ON
        S_DRAFT --> S_PENDING: services.auto_publish OFF
        S_PENDING --> LIVE: admin approve
        S_PENDING --> S_REJECTED: admin reject(reason)
        LIVE --> PAUSED: pause (contracts untouched)
        PAUSED --> LIVE: resume
        LIVE --> ARCHIVED: archive / report
    }
    state BuyingRequest {
        [*] --> PENDING: POST /services/{id}/requests
        PENDING --> BR_ACCEPTED: worker accepts → Contract
        PENDING --> BR_REJECTED: worker rejects(reason)
        PENDING --> BR_CANCELLED: employer cancels
    }
```

### Contract (the core money state machine)

```mermaid
stateDiagram-v2
    [*] --> PENDING_FUNDING: from accepted Proposal OR accepted BuyingRequest
    PENDING_FUNDING --> ACTIVE: employer funds (escrow hold)<br/>⚡ chat opens
    PENDING_FUNDING --> CANCELLED: funding timeout 48h
    ACTIVE --> DELIVERED: worker submits deliverable
    DELIVERED --> ACTIVE: employer rejects submission (resubmit loop)
    DELIVERED --> COMPLETED: employer accepts → escrow split
    ACTIVE --> DISPUTED: either party disputes
    DELIVERED --> DISPUTED: either party disputes
    DISPUTED --> ACTIVE: admin resume
    DISPUTED --> COMPLETED: admin complete (full/split)
    DISPUTED --> CANCELLED: admin cancel (refund)
    ACTIVE --> CANCELLED: mutual cancel confirmed
    COMPLETED --> [*]: warranty release (+60d)<br/>earnings_pending → available<br/>chat → READ_ONLY, reviews lock
    CANCELLED --> [*]
    note right of COMPLETED
        warranty_ends_at = now + 60d
        reviews editable until then
    end note
```

---

## 3. Golden path A — Job → Proposal → Contract → Delivery → Release

```mermaid
sequenceDiagram
    actor Emp as Employer
    actor Wrk as Worker
    participant Adm as Admin/Moderator
    participant Sys as Backend
    participant Wal as Wallet/Ledger
    participant N as Notifications

    Emp->>Sys: POST /me/jobs
    alt jobs.auto_publish OFF
        Sys->>Adm: Job PENDING_REVIEW
        Adm->>Sys: approve
    end
    Sys->>N: Job PUBLISHED → fanout to category subscribers
    Wrk->>Sys: POST /jobs/{id}/proposals (+ screening answers)
    Note over Sys: validate self-deal/dup/required answers
    alt bids.enabled & not invited
        Sys->>Wal: consume_bid (-1, needs ≥1)
    end
    alt proposals.auto_publish OFF
        Sys->>Adm: Proposal PENDING_APPROVAL
        Adm->>Sys: pass (or reject→refund bid)
    end
    Sys->>N: notify Employer "عرض جديد"
    Emp->>Sys: GET /me/jobs/{id}/proposals (→ VIEWED)
    Emp->>Sys: POST /proposals/{id}/accept
    Sys->>Sys: Contract PENDING_FUNDING; Job IN_PROGRESS; invitations EXPIRE
    Emp->>Sys: POST /contracts/{id}/fund
    Sys->>Wal: available -budget ; escrow_held +budget (CONTRACT_HOLD x2)
    Sys->>Sys: Contract ACTIVE; auto-open Conversation
    Sys->>N: notify BOTH "تم تمويل العقد"
    Wrk->>Sys: POST /contracts/{id}/submissions (notes+files)
    Sys->>Sys: Submission OPEN; Contract DELIVERED
    Sys->>N: notify Employer "تم التسليم"
    alt reject
        Emp->>Sys: POST /submissions/{id}/reject(reason)
        Sys->>Sys: Submission REJECTED; Contract ACTIVE (loop)
    else accept
        Emp->>Sys: POST /submissions/{id}/accept
        Sys->>Wal: escrow_held -budget ; worker earnings_pending +worker_earning ; platform available +commission
        Sys->>Sys: Contract COMPLETED; warranty_ends_at=+60d
        Sys->>N: notify BOTH "بدأت فترة الضمان"
    end
    Note over Sys,Wal: Celery release_due_warranties (after 60d)
    Sys->>Wal: worker earnings_pending -x ; available +x
    Sys->>Sys: funds_released=true; chat READ_ONLY; reviews LOCK; affiliate accrue
    Emp-->>Sys: POST /contracts/{id}/reviews (1-5★)
    Wrk-->>Sys: POST /contracts/{id}/reviews (1-5★)
    Wrk->>Sys: POST /me/withdrawals (min $10)
    Sys->>Wal: WITHDRAWAL_HOLD (available -amount)
    Adm->>Sys: process → PAID (or REJECTED→reversed)
```

## 3b. Golden path B — Service → Buying Request → Contract

```mermaid
sequenceDiagram
    actor Wrk as Worker
    actor Emp as Employer
    participant Sys as Backend
    Wrk->>Sys: POST /me/services → (auto_publish) LIVE or PENDING_REVIEW→approve
    Emp->>Sys: POST /services/{id}/requests (qty, add-ons; total frozen)
    Sys->>Wrk: notify "طلب جديد على خدمتك" (BuyingRequest PENDING)
    Wrk->>Sys: POST /requests/{id}/accept
    Sys->>Sys: Contract PENDING_FUNDING
    Note over Emp,Sys: from here identical to path A:<br/>fund → deliver → accept → warranty → review
```

---

## 4. Chat — client-write Firestore + backend control plane

```mermaid
sequenceDiagram
    actor A as Sender
    actor B as Recipient
    participant FE as Frontend
    participant FS as Firestore
    participant CF as Cloud Function
    participant API as Backend
    participant PG as Postgres

    Note over A,API: Conversation opens ONLY when contract ACTIVE/DELIVERED/DISPUTED (D-2).<br/>Auto-created on funding. Pair stored user_a.id<user_b.id.
    A->>FE: POST /chat/token
    FE->>API: mint custom token (uid==user.id)
    API-->>FE: Firebase custom token
    FE->>FS: signInWithCustomToken

    alt Plain text (heavy path)
        A->>FS: addDoc(messages) — direct write
        Note over FS: security rules: sender==uid,<br/>status=='active', body≤5000
        FS-->>B: onSnapshot (live)
        FS->>CF: onCreate trigger
        CF->>API: POST /chat/sync (X-Chat-Sync-Secret, firestore_id)
        API->>PG: get_or_create(firestore_id) — idempotent mirror
    else Attachment (always REST)
        A->>API: POST /uploads then POST /conversations/{id}/messages
        API->>PG: create Message + link attachments
        API->>FS: mirror_message (with pgId → CF skips)
        FS-->>B: onSnapshot (live)
    end

    B->>API: GET messages (or POST /read)
    API->>PG: ConversationMember.last_read_at = now
    API->>FS: mirror reads.<uid> → A sees ✓✓
    Note over API: Celery: message unread >10min →<br/>send_unread_chat_emails (once, respects chat_unread pref)
```

### Chat lifecycle & safety

```mermaid
flowchart LR
    Active["Conversation ACTIVE"] -->|warranty release| RO["READ_ONLY"]
    Active -->|non-contract idle >30d| RO
    Active -->|owner frozen BR-23| RO
    Active -->|report resolved: archive| RO
    Active -->|"POST /conversations/{id}/report (30/min)"| Rep["ChatReport OPEN"]
    Rep -->|admin| Warn["warn (force notify)"]
    Rep -->|admin| Freeze["freeze user (BR-23 cascade)"]
    Rep -->|admin| Arc["archive → READ_ONLY"]
    Rep -->|admin| Dis["dismiss"]
    RO -.->|rules reject sends| X["no new messages"]
```

---

## 5. Money & escrow (three buckets)

```mermaid
flowchart TD
    PP["PayPal deposit<br/>POST /wallet/charge → confirm"] --> AV["available"]
    AV -->|fund contract| ESC["escrow_held"]
    ESC -->|submission accepted| EARN["worker earnings_pending"]
    ESC -->|"split: commission"| PLAT["platform available"]
    EARN -->|warranty +60d| AVW["worker available"]
    AVW -->|"POST /me/withdrawals (min $10)"| HOLD["WITHDRAWAL_HOLD"]
    HOLD -->|admin PAID| OUT["paid to PayPal/payout method"]
    HOLD -->|admin REJECTED| AVW
    AV -->|"buy bid plan (Starter 10/$5, Pro 30/$12, Business 75/$25)"| BIDS["BidLedger +N"]
    ESC -->|cancel / dispute-cancel| AV
    note1["Invariant BR-24: budget = worker_earning + commission (exact)<br/>commission frozen at contract creation"]
```

### Bid ledger (append-only; balance = Σ deltas)

```mermaid
flowchart LR
    SU["SIGNUP_GRANT +10"] --> BAL(("balance"))
    MG["MONTHLY_GRANT +0 (stub, no scheduler)"] --> BAL
    PU["PURCHASE +N (wallet)"] --> BAL
    BAL --> CO["CONSUME -1 (proposal submit)"]
    CO --> RM["REFUND_MODERATION +1 (moderator rejects)"]
    CO --> RJ["REFUND_JOB_CLOSED +1 (job closed/expired)"]
    AA["ADMIN_ADJUST ±N"] --> BAL
    note2["No refund for worker-cancel or employer-reject"]
```

---

## 6. Notifications fan-out

```mermaid
flowchart TD
    EV["Event"] --> NF["notify(user, kind, ...)"]
    NF --> ROW["1 in-app Notification row"]
    NF --> PREF{"transactional?"}
    PREF -->|"CONTRACT, PAYMENT, SUBMISSION, INVITATION, TICKET — always"| SEND
    PREF -->|"CHAT_MESSAGE→chat_unread, PROPOSAL→proposal_updates, ADMIN→marketing, job_alerts"| OPT{"pref allows?"}
    OPT -->|yes| SEND
    OPT -->|no| INAPP["in-app only"]
    SEND --> EM{"emails.enabled?"}
    EM -->|yes| MAIL["send_branded_email (RTL, deep_link)"]
    SEND --> PUSH["FCM push (stub)"]
    BC["ScheduledNotification broadcast<br/>(everyone/workers/employers/specific)"] -->|Celery 60s| NF
```

---

## 7. Trust & safety

### Content reports (Report: SERVICE/JOB/FREELANCER/PORTFOLIO/PROPOSAL/BUYING_REQUEST)

```mermaid
flowchart TD
    R["POST /reports {kind, object_id, reason} (30/min)"] --> Dup{"reporter has OPEN report for item?"}
    Dup -->|yes| Noop["return existing (no-op)"]
    Dup -->|no| Open["Report OPEN"]
    Open --> Q["Admin queue"]
    Q -->|Remove Item| Act["status=ACTIONED + per-kind action"]
    Q -->|Dismiss| Dism["status=DISMISSED"]
    Act --> K["service→ARCHIVED · job→ARCHIVED · freelancer→profile REJECTED<br/>portfolio→hard delete · proposal→WITHDRAWN · buying_request→CANCELLED"]
    Act --> Sib["sibling OPEN reports auto-ACTIONED + notify owner"]
```

### Support ticket lifecycle + dispute bridge (BR-22)

```mermaid
stateDiagram-v2
    [*] --> OPEN: POST /tickets
    OPEN --> ANSWERED: admin replies
    ANSWERED --> OPEN: user replies
    OPEN --> PENDING: admin (await external)
    OPEN --> ON_HOLD: admin (reason mandatory)
    ON_HOLD --> OPEN: admin resume / user reply
    PENDING --> OPEN: user reply
    OPEN --> SOLVED: admin solve(report)
    SOLVED --> CLOSED: admin close
    OPEN --> CLOSED: admin close
    note right of CLOSED
        read-only; BLOCKED while
        linked contract is DISPUTED
    end note
```

```mermaid
sequenceDiagram
    actor P as Party
    participant Sys as Backend
    participant Adm as Admin
    participant T as Ticket (is_dispute)
    P->>Sys: POST /contracts/{id}/dispute  (ACTIVE/DELIVERED)
    Sys->>Sys: Contract DISPUTED; dispute_ticket_ref set
    Note over Sys,T: dispute-type ticket couples to contract
    Adm->>Sys: resolve outcome
    alt complete (full/split)
        Sys->>Sys: split escrow → COMPLETED
    else cancel
        Sys->>Sys: refund employer → CANCELLED
    else resume
        Sys->>Sys: back to ACTIVE/DELIVERED
    end
    Sys->>T: _close_coupled_ticket() → CLOSED
```

### Reviews & warranty window

```mermaid
flowchart LR
    C["Contract COMPLETED"] --> LR["POST /contracts/{id}/reviews<br/>1-5★ + comment (one per party, author≠subject BR-21)"]
    LR --> Agg["recompute rating_avg/count on both profiles"]
    LR --> Edit["PATCH /reviews/{id} editable..."]
    Edit -->|until warranty ends| OK
    W["warranty release +60d"] --> Lock["is_locked=true → edits blocked (BR-13)"]
    Agg --> Pub["GET /users/{id}/reviews (public)"]
```

### ID verification

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /me/id-verification<br/>(national_id|passport|driver_license + consent)
    PENDING --> APPROVED: admin → WorkerProfile.is_verified=true (badge)
    PENDING --> REJECTED: admin reject(reason) → is_verified=false
    REJECTED --> PENDING: resubmit (new files)
    APPROVED --> [*]
```

---

## 8. Affiliate funnel (BR-18)

```mermaid
sequenceDiagram
    actor R as Referrer
    actor V as Visitor→New User
    participant FE as Frontend
    participant API as Backend
    participant Wal as Wallet

    R->>API: PATCH /me/affiliate/slug (3-40 chars)
    R->>V: share link FRONTEND_URL/r/{slug}
    V->>API: POST /affiliate/click {slug}
    API-->>V: set aff_ref cookie (affiliate.cookie_days=30)
    V->>API: Google signup
    API->>API: POST /affiliate/attribute → Referral(earning_window_end=+30d), no self-referral
    Note over API: later... referred user's contract reaches warranty release
    API->>API: accrue_for_contract() — within window? referrer not frozen? rule match?
    API->>Wal: AFFILIATE +amount (base=commission × rule rate_pct) → referrer available
    R->>API: GET /me/affiliate (clicks, registrations, transactions, total_earned)
```

---

## 9. Discovery & engagement

```mermaid
flowchart TD
    subgraph Search
      J["GET /jobs"] --- F1["category (descendant-aware), subcategory,<br/>location_type, budget_min/max, search, ordering"]
      S["GET /services"] --- F2["category, worker, search, ordering"]
      W["GET /freelancers"] --- F3["category, expertise_level, search,<br/>ordering=rating (ONLINE+ACTIVE only)"]
    end
    subgraph Favorites
      FV["PUT/DELETE /me/favorites/{kind}/{id}<br/>kind: job|freelancer|portfolio (+ service)"] --> FVL["GET /me/favorites?kind= (tabs)"]
    end
    subgraph Alerts
      SUB["PUT /me/category-subscriptions"] --> FAN["job published → Celery fanout_job_published<br/>→ branded email if job_alerts pref"]
      WL["PUT/DELETE /me/watchlist/{job_id}<br/>(personal collection, NOT alerts)"]
    end
    subgraph Portfolio
      PF["/me/portfolio CRUD"] --> PM["public: /freelancers/portfolio,<br/>/freelancers/portfolio-media/{id} (inline),<br/>/gallery — ONLINE+ACTIVE gated, views_count++"]
    end
```

---

## 10. Freeze cascade (BR-23)

```mermaid
flowchart TD
    FR["Admin freeze user"] --> U["User FROZEN (login blocked)"]
    U --> J["Job PUBLISHED → SUSPENDED"]
    U --> S["Service LIVE → PAUSED"]
    U --> P["Proposal open → SUSPENDED (bid stays spent)"]
    U --> I["Invitation SENT → SUSPENDED"]
    U --> C["Conversation ACTIVE → READ_ONLY"]
    U --> A["Affiliate accrual stops"]
    U --> K["Open contracts: counterpart notified; escrow held"]
    note1["each stores frozen_prev_status"]
    UF["Unfreeze"] --> RST["restore each from frozen_prev_status<br/>(chat stays READ_ONLY if contract COMPLETED/CANCELLED)"]
```
