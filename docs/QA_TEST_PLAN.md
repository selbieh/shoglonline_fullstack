# ShoghlOnline — QA Test Plan

**Scope:** End-to-end verification of every implemented flow — backend API, frontend UI, full functionality, negative/edge cases, UI/UX issues, and "not-working function" regressions.
**Approach:** Critical-path focused (happy paths + the highest-risk negatives, permission checks, money invariants, and state transitions). Not every permutation — the riskiest ones.
**Companion automation:** A starter automated suite ships with this plan; see §22 for what's automated now vs. what stays manual.

---

## 1. How to run the test suites

| Suite | Command | Notes |
|---|---|---|
| Backend (pytest) | `cd backend && pytest` | Needs Django 5.x env. Use Docker: `docker compose exec backend pytest`. 90% coverage gate. |
| Backend single file | `docker compose exec backend pytest tests/integration/test_phone_otp.py --no-cov` | `--no-cov` for slice runs (subset under-reports coverage). |
| Frontend unit (vitest) | `cd frontend && npm run test` | jsdom + MSW. Coverage: `npm run test:cov`. |
| Frontend e2e (Playwright) | `cd frontend && npm run e2e` | Auto-starts `npm run dev`. Full flows need the stubbed stack up (`GOOGLE_AUTH_STUB` on); CI passes `PLAYWRIGHT_BASE_URL`. |

---

## 2. Legend

- **Priority:** `P0` = blocks launch (money, auth, data loss, security). `P1` = core flow broken. `P2` = polish / edge.
- **Layer:** `API` backend endpoint · `UI` manual browser check · `E2E` end-to-end · `UNIT` component/service.
- **Auto:** ✅ automated today · ⬜ manual / to automate.
- **Result columns** (for the tester): Pass / Fail / Blocked + notes + screenshot/log.

---

## 3. Test environments & accounts

- **Stub auth:** `GOOGLE_AUTH_STUB` on → "دخول تجريبي" button on `/signin` creates/loads a stub user (no real Google).
- **Seed data:** run `make seed` (catalog + settings). Verify categories/skills exist before browse tests.
- **Two personas needed:** an **employer** (mode `find_worker`) and a **worker/freelancer** (mode `find_job`). Most contract tests need both, plus a funded employer wallet.
- **Admin:** a staff user for Django admin moderation checks.
- **Feature flags to exercise:** `jobs.auto_publish`, `proposals.auto_publish`, `services.auto_publish`, `bids.enabled`, `chat.enabled`, `emails.enabled`, `profiles.phone_verification`, `registration.enabled`.
- **Currency:** **USD only, system-wide** (`platform.currency = "USD"`, PayPal-compatible — there is **no KWD / multi-currency**). Every amount in UI and API is USD; flag any non-USD symbol as a bug.

---

## 4. Cross-cutting checks (apply to EVERY screen/endpoint)

| ID | P | Layer | Check | Expected |
|---|---|---|---|---|
| X-01 | P0 | API | Protected endpoint without token | 401/403, never data leak |
| X-02 | P0 | UI | Protected page without session | Redirect to `/signin?next=…` |
| X-03 | P1 | UNIT | Access token expired mid-session | One silent refresh, retry succeeds; on refresh fail → logout+redirect |
| X-04 | P1 | UI | RTL layout | Arabic, `dir="rtl"`, no mirrored/broken alignment, no English leakage |
| X-05 | P1 | UI | Responsive 360 / 768 / 1920 px | No horizontal scroll; nav usable; content reflows |
| X-06 | P1 | UI | Loading / empty / error states | Skeleton on load; friendly empty state; Arabic error toast on failure |
| X-07 | P1 | UI | Form submit | Button disabled while submitting; no double-submit; validation messages in Arabic |
| X-08 | P2 | UI | Icons & brand | Line-icons (no emoji), pastel tints, logo + footer present |
| X-09 | P1 | API | Self-dealing (BR-21) | A user can never transact with themselves on any flow |
| X-10 | P1 | API | Frozen account (BR-23) | All actions blocked; listings/chats paused |
| X-11 | P2 | UI | 404 / unknown route | Branded not-found page, not a crash |
| X-12 | P1 | API | Text fields with contact info | Phone/email/URLs stripped or rejected where the "no-contact" rule applies |
| X-13 | P1 | UI/API | Currency is USD-only | Every amount is USD ($); no KWD/other symbol anywhere |

---

## 4a. ✅ Stakeholder rules — now enforced in code

Three rules were confirmed by the stakeholder. Two required code changes (now done); one already matched.

| # | Rule | Status | What was built | Tests |
|---|---|---|---|---|
| D-1 | Profile publishes **only after an admin approves**; admin sees the completeness %. | ✅ Implemented | Publish (≥70%) now sets **PENDING_REVIEW**; admin approves → PUBLISHED / rejects → REJECTED+reason, via Django-admin actions that show completeness %. `WorkerProfile.PublishState` gained `pending_review`/`rejected` + review fields (migration `0015`). | `tests/integration/test_profile_publish_review.py` |
| D-2 | Chat opens **only when the two parties have an ACTIVE (funded) contract**. | ✅ Implemented | Proposal-stage chat removed; `get_or_create_for_contract` only opens for Active/Delivered/Disputed contracts; `StartConversationView` accepts `contract_id` only. | `tests/test_chat.py::TestInitiation` |
| C-1 | **USD only**, no multi-currency. | ✅ Already matched | `platform.currency = "USD"` (PayPal-compatible). | n/a — assert in UI/PAY checks |

> ✅ Also already aligned: **mobile OTP gated by an admin/operator flag** (`profiles.phone_verification`, off by default).
> ⚠️ Minor follow-up: the demo `seed` command still creates one proposal-context conversation (`apps/core/management/commands/seed.py:816`) — harmless (the model still allows that context) but inconsistent with D-2; update when convenient.

---

## 5. Auth & onboarding — `AUTH`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| AUTH-01 | P0 | E2E | ✅ | New user Google sign-in | Sign in (stub) as a brand-new account | 201; `first_login=true`; redirected to `/onboarding/mode` |
| AUTH-02 | P0 | E2E | ✅ | Returning user sign-in | Sign in with an account that has a mode | Lands on `/dashboard` |
| AUTH-03 | P0 | API | ⬜ | Frozen user blocked | Attempt login as frozen account | Rejected; login audit `login_failed` |
| AUTH-04 | P1 | API | ✅ | Deleted account re-signup | Delete account, sign in again with same Google | New fresh account (old `google_sub` freed); no old data |
| AUTH-05 | P1 | API | ✅ | `registration.enabled=false` | Toggle off, attempt new signup | PermissionDenied |
| AUTH-06 | P1 | API | ✅ | Mode toggle | PATCH mode `find_job`↔`find_worker` | `active_mode` updates; **never** used for authz |
| AUTH-07 | P1 | UNIT | ✅ | 401 → refresh → retry | Call with stale token | One refresh, original request retried, succeeds |
| AUTH-08 | P1 | API | ✅ | Logout | Logout with refresh token | 204; refresh token blacklisted (reuse fails) |
| AUTH-09 | P0 | API | ✅ | Phone OTP gated off (default) | Request OTP with flag off | 400 `phone_verification_disabled` |
| AUTH-10 | P1 | API | ✅ | Phone OTP happy path | Flag on → request → verify with code | `phone_verified=true`, phone saved |
| AUTH-11 | P1 | API | ✅ | Phone OTP wrong code + lockout | 5 wrong codes then 1 more | `otp_mismatch`×5 then `otp_locked` |
| AUTH-12 | P1 | API | ⬜ | Email change | Request change → confirm with token | Email swapped; audit `email.changed` |
| AUTH-13 | P1 | API | ⬜ | Email change to taken email | Request change to another user's email | Rejected |
| AUTH-14 | P1 | UI | ⬜ | Worker onboarding publish gate | Complete wizard partially (<70%) then publish | Publish refused with completeness %; ≥70% succeeds |
| AUTH-15 | P1 | UI | ⬜ | Employer onboarding | Fill company profile, optional phone verify | Profile saved; dashboard accessible |
| AUTH-16 | P2 | UI | ⬜ | Sign-in is Google-only | Inspect `/signin` | No password field; only Google + stub (dev) |

---

## 6. Profile / portfolio / ID verification — `PROF`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| PROF-01 | P1 | API | ⬜ | Replace-all collections | PATCH profile with new skills/education/languages | Old rows deleted, new bulk-created (replace-all) |
| PROF-02 | P1 | API | ✅ | Publish → admin review (D-1) | Complete profile (≥70%), publish → admin approves | publish → `pending_review`; admin approve → `published`; reject → `rejected`+reason |
| PROF-03 | P1 | UI | ⬜ | Visibility toggle | Set offline | Hidden from `/freelancers` directory |
| PROF-04 | P1 | API | ✅ | Portfolio CRUD | Create/edit/delete portfolio item | Reflected in owner + public gallery |
| PROF-05 | P0 | API | ✅ | Portfolio media public-but-scoped | Fetch portfolio-media while online vs offline | Inline when online+active; 404 when offline/frozen |
| PROF-06 | P2 | API | ⬜ | Certificates CRUD | Add/delete certificate with file | Listed; file linked |
| PROF-07 | P1 | API | ✅ | Submit ID verification | Submit docs | Status `pending` |
| PROF-08 | P1 | API | ✅ | Admin approves ID | Approve in admin | `is_verified=true`, badge appears publicly; reject sets reason |
| PROF-09 | P2 | UI | ⬜ | Avatar fallback | Break avatar URL | Fallback initials/placeholder, no broken image |
| PROF-10 | P1 | API | ✅ | Upload validation | Upload oversized / wrong MIME / spoofed | Rejected with Arabic error; magic-byte sniff enforced |
| PROF-11 | P1 | API | ✅ | Public directory gating | List freelancers | Only online + active workers shown |
| PROF-12 | P2 | UI | ⬜ | Completeness meter | Edit profile fields | % updates live and matches backend logic |

---

## 7. Catalog & search — `CAT`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| CAT-01 | P1 | API | ✅ | Category tree | GET categories | Hierarchy with parents/children, active only |
| CAT-02 | P2 | API | ⬜ | Skills by subcategory | GET skills?subcategory=… | Filtered, active only |
| CAT-03 | P1 | UI | ⬜ | Service browse filters | Filter by category/search/price sort | Correct results; URL reflects filters |
| CAT-04 | P1 | API | ✅ | Job filters incl. budget overlap | Filter jobs by category/budget/search/sort | Correct subset; published+public only |
| CAT-05 | P1 | UI | ⬜ | Freelancer filters | Filter by expertise + search + rating sort | Correct ordering |

---

## 8. Services (gigs) — `SVC`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| SVC-01 | P1 | UI | ⬜ | Create service wizard | Complete 4-step create | Service saved as draft |
| SVC-02 | P1 | API | ✅ | Publish auto vs review | Publish with `services.auto_publish` on/off | LIVE immediately / PENDING_REVIEW |
| SVC-03 | P1 | API | ✅ | Admin approve/reject | Approve PENDING_REVIEW; reject with reason | LIVE / REJECTED+reason |
| SVC-04 | P1 | API | ✅ | Pause/resume/archive | Toggle states | LIVE↔PAUSED; ARCHIVED terminal |
| SVC-05 | P1 | API | ✅ | Add-on pricing | Buy with add-ons + quantity | total = (base+add-ons)×qty; delivery extends |
| SVC-06 | P1 | UI | ⬜ | Service detail public | Open `/services/[slug]` | Renders gallery, price, seller, reviews |
| SVC-07 | P1 | API | ⬜ | Cannot edit others' service | Edit a service you don't own | 403/404 |

---

## 9. Service ordering (buying requests) — `ORD`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| ORD-01 | P1 | API | ✅ | Create buying request | Employer requests a service | Status `pending`; price/delivery frozen |
| ORD-02 | P0 | API | ✅ | Cannot buy own service | Owner requests own service | Blocked (BR-21) |
| ORD-03 | P1 | API | ⬜ | Frozen buyer blocked | Frozen employer requests | Blocked (BR-23) |
| ORD-04 | P0 | API | ✅ | Accept → contract | Worker accepts request | Contract created `pending_funding` |
| ORD-05 | P1 | API | ✅ | Reject (reason) | Worker rejects | Status `rejected`, reason saved |
| ORD-06 | P1 | API | ⬜ | Cancel before accept | Employer cancels | Status `cancelled` |

---

## 10. Jobs — `JOB`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| JOB-01 | P1 | UI | ⬜ | Post a job | Fill `/jobs/new`, submit | Created; auto-submitted for publication |
| JOB-02 | P1 | API | ✅ | Moderation gate | `jobs.auto_publish` on/off | PUBLISHED / PENDING_REVIEW |
| JOB-03 | P1 | API | ✅ | Admin approve/reject job | Approve/reject in admin | PUBLISHED / REJECTED |
| JOB-04 | P1 | API | ✅ | Edit lock after proposals | Edit title/desc after a proposal exists | Blocked (BR-4) |
| JOB-05 | P0 | API | ✅ | Close job refunds bids | Close a job with open proposals | Proposals withdrawn; bids refunded (FR-BID-6) |
| JOB-06 | P1 | API | ✅ | Repost public/private | Repost closed job | Public re-listed / private creates invitation |
| JOB-07 | P1 | API | ✅ | Rehire past worker | Rehire from completed contract | Private job + invitation to that worker |
| JOB-08 | P1 | API | ✅ | Public list = published only | GET /jobs | No draft/pending/private shown |
| JOB-09 | P1 | API | ⬜ | Private job hidden | Create private job | Absent from public list; visible to invitee |
| JOB-10 | P1 | API | ✅ | Screening required | Apply without answering required questions | Rejected |

---

## 11. Proposals & bids — `BID`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| BID-01 | P1 | API | ✅ | Submit consumes 1 bid | Worker applies | Proposal `submitted`; balance −1 |
| BID-02 | P1 | API | ✅ | Invited = free | Invited worker applies | No bid consumed |
| BID-03 | P0 | API | ✅ | Cannot bid own job | Employer applies to own job | Blocked (BR-21) |
| BID-04 | P1 | API | ✅ | No duplicate proposal | Apply twice to same job | Second rejected |
| BID-05 | P1 | API | ✅ | Frozen worker blocked | Frozen worker applies | Blocked (BR-23) |
| BID-06 | P1 | API | ⬜ | Insufficient bids | Apply with 0 balance, bids enabled | Blocked with clear message |
| BID-07 | P1 | API | ✅ | Employer views → VIEWED | Employer opens proposals | Each marked viewed |
| BID-08 | P0 | API | ✅ | Accept → contract + siblings rejected | Accept one proposal | Contract created; other proposals rejected; job IN_PROGRESS |
| BID-09 | P1 | API | ✅ | Reject (reason) | Reject a proposal | Reason required, saved |
| BID-10 | P1 | API | ✅ | Worker cancel (no refund) | Worker cancels own proposal | `cancelled`, no bid refund (BR-7) |
| BID-11 | P0 | API | ✅ | Close refunds bid | Close job | Open proposals refunded +1 |
| BID-12 | P1 | API | ✅ | Buy bid plan | Purchase plan | Wallet −cost; balance +bids |
| BID-13 | P1 | API | ✅ | `bids.enabled=false` | Apply with bids off | No consumption (commission-only mode) |
| BID-14 | P2 | API | ⬜ | Invitation reject | Worker rejects invitation | Status updated |

---

## 12. Contracts — `CON`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| CON-01 | P0 | API | ✅ | Created pending_funding | Accept proposal | Commission frozen; 48h funding deadline |
| CON-02 | P0 | API | ✅ | Auto-fund from wallet | Employer has balance | escrow held; status `active` |
| CON-03 | P1 | API | ✅ | Manual fund | Fund after deposit | `active` |
| CON-04 | P1 | API | ⬜ | Funding timeout | Let deadline pass unfunded | `cancelled`, full refund |
| CON-05 | P1 | API | ✅ | Deliver | Worker submits | `delivered` |
| CON-06 | P0 | API | ✅ | Accept submission | Employer accepts | `completed`; escrow→earnings_pending + commission; warranty starts |
| CON-07 | P1 | API | ✅ | Reject submission | Employer rejects with reason | Back to `active` |
| CON-08 | P1 | API | ✅ | Update budget +) | Request increase | Sits `pending_funding` until charged; re-freezes commission |
| CON-09 | P1 | API | ✅ | Update budget −) | Request decrease | Difference refunded |
| CON-10 | P1 | API | ✅ | Mutual cancel | Request + confirm | `cancelled`; full refund; job closed |
| CON-11 | P0 | API | ✅ | Dispute | Open dispute | `disputed`; escrow frozen |
| CON-12 | P0 | API | ✅ | Admin resolve | Resolve resume/complete/cancel/split | Correct ledger legs per outcome |
| CON-13 | P0 | API | ✅ | Warranty release | Trigger release | earnings_pending→available; chat+reviews lock; affiliate accrues |
| CON-14 | P0 | API | ✅ | Money invariant | After any transition | commission + worker_earning == budget; balance == Σ ledger |
| CON-15 | P0 | API | ✅ | Only parties act | Third party tries any action | 403/404 |
| CON-16 | P1 | UI | ⬜ | Contract detail UI | Open `/contracts/[id]` | Timeline, role-correct action buttons, submissions, update requests |

---

## 13. Reviews — `REV`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| REV-01 | P1 | API | ✅ | Review after completion | Both parties review | Saved 1–5 + comment |
| REV-02 | P1 | API | ⬜ | Review before completion | Try on active contract | Rejected |
| REV-03 | P1 | API | ✅ | One per author/contract | Review twice | Second rejected |
| REV-04 | P1 | API | ✅ | No self-review | author==subject | Rejected |
| REV-05 | P1 | API | ✅ | Edit during warranty | Edit before lock | Allowed |
| REV-06 | P1 | API | ✅ | No edit after lock | Edit after warranty | Rejected (BR-13) |
| REV-07 | P1 | API | ✅ | Aggregates update | After review | profile rating_avg/count recomputed per role |
| REV-08 | P2 | UI | ⬜ | Public reviews | Visit profile/service | Recent reviews + average shown |

---

## 14. Invoices — `INV`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| INV-01 | P1 | API | ✅ | Create request | Worker requests for a period | Lines = completed contracts in range; number `INV-…` |
| INV-02 | P1 | API | ✅ | Confirm → PDF | Employer confirms | `confirmed`; PDF generated |
| INV-03 | P1 | API | ✅ | Reject (reason) | Employer rejects | `rejected`, reason saved |
| INV-04 | P1 | API | ⬜ | Only completed included | Mix completed/active | Active excluded |
| INV-05 | P2 | UI | ⬜ | Inbox + list | Worker `/invoices`, employer incoming | Correct lists & statuses |

---

## 15. Payments / wallet — `PAY`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| PAY-01 | P1 | API | ✅ | Wallet shape | GET wallet | 3 buckets + currency |
| PAY-02 | P0 | API | ✅ | Deposit (PayPal) | charge → confirm | available increases on capture |
| PAY-03 | P0 | API | ✅ | Deposit idempotent | Confirm twice | No double credit |
| PAY-04 | P1 | API | ⬜ | Min deposit | Deposit < min | Rejected |
| PAY-05 | P0 | API | ✅ | Withdrawal holds immediately | Request withdrawal | available −amount at once (no double-spend) |
| PAY-06 | P1 | API | ⬜ | Min withdrawal | Withdraw < min | Rejected |
| PAY-07 | P0 | API | ✅ | Insufficient balance | Withdraw > available | Rejected |
| PAY-08 | P0 | API | ✅ | Admin process | Pay / reject | paid (zero-sum marker) / reversed (restores hold) |
| PAY-09 | P0 | API | ✅ | Tokenized cards only | Add method with raw PAN | Rejected (SAQ-A); only token + masked stored |
| PAY-10 | P1 | API | ⬜ | Payout methods CRUD | Add/default/delete | Reflected; EG rails accepted |
| PAY-11 | P2 | API | ✅ | Transactions filter | List with type/status | Correct subset; ref `TRX-…` |
| PAY-12 | P1 | UI | ⬜ | Card checkout absent | Attempt card top-up | Only PayPal offered; no broken card flow |
| PAY-13 | P1 | UI | ⬜ | Wallet page | Open `/wallet` | Balances, history, top-up + payout actions render |

---

## 16. Chat — `CHAT`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| CHAT-01 | P1 | API | ✅ | Chat opens on active contract (D-2) | Fund a contract | Conversation auto-opens; both parties members |
| CHAT-02 | P0 | API | ✅ | No chat before active contract (D-2) | Try proposal/unfunded-contract chat | Blocked (`no_active_contract`); `/conversations` needs `contract_id` |
| CHAT-03 | P0 | API | ✅ | Worker cannot cold-message | Worker initiates | Blocked (BR-11) |
| CHAT-04 | P0 | API | ✅ | Self-chat blocked | Chat with self | Blocked (BR-21) |
| CHAT-05 | P1 | API | ✅ | Send message | Post message | Persisted + Firestore mirror; recipient notified |
| CHAT-06 | P1 | API | ⬜ | Firebase token | Request token | Per-user custom token (UID = user id) |
| CHAT-07 | P1 | API | ⬜ | Firestore sync auth | Sync without/with secret | Denied without; idempotent on firestore_id |
| CHAT-08 | P1 | API | ✅ | Banned words | Send banned word | Filtered/blocked |
| CHAT-09 | P0 | API | ✅ | Read-only after warranty | Send after warranty end | Blocked; conversation read_only |
| CHAT-10 | P1 | API | ✅ | Report → disposition | Report; admin acts | dismiss/warn/freeze/archive |
| CHAT-11 | P1 | API | ⬜ | `chat.enabled=false` | Send with chat off | Blocked (kill-switch) |
| CHAT-12 | P1 | UI | ⬜ | Thread realtime + attachments | Open `/messages/[id]`, send + file | Live update; file shared; read receipts |

---

## 17. Notifications — `NOT`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| NOT-01 | P1 | API | ✅ | List + unread count | Generate events | Listed; count correct |
| NOT-02 | P1 | API | ⬜ | Mark read / read-all | Mark | read_at set; count drops |
| NOT-03 | P1 | API | ✅ | Suppressible respects pref | Opt out, trigger | Not created/sent |
| NOT-04 | P0 | API | ✅ | Transactional always sent | Opt out, trigger contract/payment | Still delivered |
| NOT-05 | P1 | API | ✅ | Force override | Force a critical notice | Delivered despite opt-out |
| NOT-06 | P1 | API | ⬜ | Prefs get/put | Update prefs | Persisted |
| NOT-07 | P1 | API | ⬜ | Email kill-switch | `emails.enabled=false` | No email; in-app still created |
| NOT-08 | P2 | UI | ⬜ | Feed UI | Open `/notifications` | Renders, mark-read works |

---

## 18. Subscriptions / affiliate / tickets / CMS

### Subscriptions — `SUB`
| ID | P | Layer | Auto | Scenario | Expected |
|---|---|---|---|---|---|
| SUB-01 | P2 | API | ✅ | Empty by default | GET → `[]` |
| SUB-02 | P1 | API | ✅ | PUT replace-all | Full set replaced; empty list clears |
| SUB-03 | P1 | API | ✅ | Invalid category | 400 |
| SUB-04 | P1 | API | ✅ | Per-user isolation | No leakage across users |
| SUB-05 | P2 | UI | ⬜ | Page | `/subscriptions` renders + saves |

### Affiliate — `AFF`
| ID | P | Layer | Auto | Scenario | Expected |
|---|---|---|---|---|---|
| AFF-01 | P1 | API | ✅ | Click records + cookie | Click logged; `aff_ref` cookie set |
| AFF-02 | P1 | API | ✅ | Attribute at signup | Referral created in window |
| AFF-03 | P0 | API | ✅ | Self-referral void | Blocked (BR-21) |
| AFF-04 | P0 | API | ✅ | Accrue at warranty release | Commission on platform fee; idempotent |
| AFF-05 | P1 | API | ⬜ | Clawback on refund | Reversed; marked clawed_back |
| AFF-06 | P1 | API | ⬜ | Frozen affiliate | Earns nothing |
| AFF-07 | P2 | API | ⬜ | Slug validation | Reserved/invalid slugs rejected |
| AFF-08 | P2 | UI | ⬜ | Dashboard | `/affiliate` shows link, share, stats |

### Tickets & disputes — `TIC`
| ID | P | Layer | Auto | Scenario | Expected |
|---|---|---|---|---|---|
| TIC-01 | P1 | API | ✅ | Create ticket | Status `open` |
| TIC-02 | P0 | API | ✅ | Dispute-type flags contract | Contract → `disputed` (BR-22) |
| TIC-03 | P1 | API | ✅ | Reply reopens | User reply → `open`; staff → `answered` |
| TIC-04 | P1 | API | ✅ | Hold requires reason | Empty reason rejected (BR-14) |
| TIC-05 | P0 | API | ⬜ | Cannot close w/ open dispute | Close blocked while contract disputed |
| TIC-06 | P1 | API | ✅ | Closed read-only | Reply after close rejected |
| TIC-07 | P2 | UI | ⬜ | Ticket thread | `/tickets/[id]` renders + reply |

### CMS / landing — `CMS`
| ID | P | Layer | Auto | Scenario | Expected |
|---|---|---|---|---|---|
| CMS-01 | P1 | API | ✅ | Landing sections | Active sections+cards; fallback to defaults when empty |
| CMS-02 | P2 | API | ✅ | Page by slug | Published page returned |
| CMS-03 | P1 | API | ⬜ | Unpublished page | 404 |
| CMS-04 | P2 | API | ✅ | FAQ list | Published FAQs, filter by category |
| CMS-05 | P1 | UI | ⬜ | Landing renders | `/` shows hero/categories/CTA |

---

## 19. Settings & account — `SET`

| ID | P | Layer | Auto | Scenario | Steps | Expected |
|---|---|---|---|---|---|---|
| SET-01 | P2 | UI | ⬜ | Update name | Edit name | Saved |
| SET-02 | P1 | UI | ⬜ | Email change UI | Request + confirm | Email updated end-to-end |
| SET-03 | P1 | UI | ⬜ | Notification prefs | Toggle categories | Persisted; behavior matches NOT-03/04 |
| SET-04 | P1 | UI | ⬜ | Visibility toggle | Online/offline | Reflected in directory |
| SET-05 | P0 | API | ✅ | Deletion blocked | Delete with open contract / non-empty wallet / pending withdrawal | 409 with blockers list |
| SET-06 | P0 | API | ⬜ | Deletion success | Delete with everything settled | 204; anonymized; ledger preserved |
| SET-07 | P1 | UI | ⬜ | Payout methods | Manage at `/settings/payouts` | Add/default/delete works |

---

## 20. Admin / moderation — `ADM`

| ID | P | Layer | Auto | Scenario | Expected |
|---|---|---|---|---|---|
| ADM-01 | P1 | API | ✅ | Moderate job/service/proposal | Approve/reject transitions |
| ADM-02 | P1 | API | ✅ | ID verification review | Approve→badge / reject→reason |
| ADM-03 | P0 | API | ✅ | Dispute resolution | Outcomes post correct ledger; payout to winner |
| ADM-04 | P0 | API | ✅ | Freeze/unfreeze ripple | Listings/proposals/chats paused & restored |
| ADM-05 | P0 | API | ⬜ | Process withdrawals | Pay / reject flows |
| ADM-06 | P0 | API | ✅ | Manual wallet adjustment | Audited; reason mandatory; invariant holds |
| ADM-07 | P1 | API | ✅ | Chat report resolution | dismiss/warn/freeze/archive |
| ADM-08 | P1 | API | ✅ | Broadcast audience | everyone/workers/employers/specific honored |
| ADM-09 | P0 | API | ✅ | Ledger read-only | Admin can view, cannot mutate (AC-11) |
| ADM-10 | P0 | API | ✅ | Permission matrix | Non-staff blocked from admin actions |

---

## 21. UI/UX & robustness checklist (manual sweep)

Run on every page; log any failure as a bug.

**Layout & brand**
- [ ] RTL correct on all pages; Arabic copy complete; no untranslated English
- [ ] No horizontal scroll at 360 / 768 / 1920 px
- [ ] Logo + global footer present; line-icons (no emoji); pastel tints consistent
- [ ] Currency rendered consistently

**States**
- [ ] Loading skeletons/spinners on every data fetch
- [ ] Empty states (no jobs, no proposals, no messages, empty wallet)
- [ ] Error toasts in Arabic on API failure; retry possible
- [ ] 404 page branded

**Forms & actions**
- [ ] Validation messages clear & Arabic
- [ ] Submit buttons disable during request; no double-submit
- [ ] File upload: rejects oversize/wrong-type with message; progress shown
- [ ] Required-field enforcement matches backend

**Robustness / security**
- [ ] Direct URL to another user's resource → blocked, no leak
- [ ] XSS attempt in text fields rendered safely
- [ ] Contact-info (phone/email/links) stripped where the no-contact rule applies
- [ ] Network-offline handled gracefully (no infinite spinner)
- [ ] Concurrent/double actions (double-accept, double-fund) don't corrupt state
- [ ] Back/forward navigation keeps auth & state sane

**Accessibility (basic)**
- [ ] Focus visible; inputs labelled; sufficient contrast; keyboard nav works

---

## 22. Automated coverage map (what's automated vs. gaps)

**Already covered by the existing suite** (69 backend test files; FE vitest + e2e):
auth audit, jobs, proposals/bids, contracts (full lifecycle + money math), gigs + buying requests, reviews, invoices, payments (deposit/withdrawal/methods), chat (BR-11, warranty lock, banned words, reports), notification prefs, affiliate attribution, tickets, CMS read, profiles/portfolio/ID-verification, uploads, admin moderation/disputes/freeze/ledger, account deletion blockers. Frontend: api layer, settings flags, contract-status map, FileUpload, PaymentMethods, dashboard, profile page; e2e auth + browse + responsive.

**New automated tests shipped with this plan:**
- `backend/tests/integration/test_phone_otp.py` — phone OTP flow: flag gate, happy path, wrong-code lockout, expiry.
- `backend/tests/integration/test_subscriptions.py` — category subscriptions: empty default, replace-all, validation, per-user isolation.
- `backend/tests/integration/test_email_change.py` — email change: invalid/same/taken email, request→confirm happy path, wrong/expired token.
- `backend/tests/tasks/test_funding_timeout.py` — BR-6a sweeper: unfunded-past-deadline → cancelled; in-window and active contracts untouched.
- `frontend/e2e/authed-smoke.spec.ts` — authenticated page-load smoke across 11 key routes (catches broken/blank/auth-lost pages).
- `backend/tests/integration/test_profile_publish_review.py` — D-1 admin-approval publish: incomplete→400, complete→pending_review, approve→published, reject→reason.
- `backend/tests/test_chat.py` (rewritten) — D-2: chat opens only on funded/active contract; proposal & unfunded-contract chat blocked; `/conversations` requires `contract_id`.

**Code changes shipped (stakeholder rules D-1, D-2):**
- D-1: `WorkerProfile` publish review states + fields (migration `apps/profiles/migrations/0015_workerprofile_publish_review.py`), `PublishProfileView` → PENDING_REVIEW, `review_profile_publish` service, admin approve/reject actions with completeness display.
- D-2: `apps/chat/services.py` (`get_or_create_for_contract` gated to Active/Delivered/Disputed; `start_from_proposal` disabled), `StartConversationView` accepts `contract_id` only.

> Note: account-deletion **success/anonymization** is already covered by `tests/integration/test_account_deletion.py::test_clean_delete_soft_deletes_anonymizes_and_retains_ledger` — no new test needed.

**Known automation gaps to fill next (highest value first):**
1. Affiliate clawback on dispute refund — backend integration test (accrue → refund → reversed).
2. FE e2e deep flows: post-job, apply-to-job, contract accept/deliver/complete, wallet top-up, settings update.
3. FE component tests: `/wallet`, `/settings`, `/me/jobs`, chat thread.
4. Card-checkout-absent guard (confirm no broken UI), CMS unpublished 404, payout-method CRUD.

**Frontend follow-up from D-1/D-2 (FE not yet updated):**
- After publishing, the onboarding wizard should show "submitted for review" (profile returns `pending_review`, not `published`).
- The chat UI should only offer "open chat" on an active contract (no proposal-stage entry point).

---

## 23. Bug reporting

For each failure, file: **ID** (scenario ref), **severity** (S1 blocker / S2 major / S3 minor / S4 cosmetic), **layer** (BE/FE/UI), **steps to reproduce**, **expected vs actual**, **environment**, **screenshot/log/network trace**. Link the scenario ID from this plan so coverage stays traceable.

## 24. Sign-off gate

- [ ] All P0 scenarios Pass (no S1/S2 open)
- [ ] Backend suite green at ≥90% coverage
- [ ] FE unit suite green; e2e auth + authed-smoke green
- [ ] UI/UX checklist (§21) swept on a real device + desktop
- [ ] Money invariants (CON-14, PAY-*) verified with no ledger drift
