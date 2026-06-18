# ShoghlOnline — SRS Gap Analysis & Implementation Plan

Code-verified audit of **SRS v1.1** against the current build (Phases 0–9). For each module:
✅ done · 🟡 partial · ❌ missing — with the specific gap and SRS reference.

> **Headline:** the transactional core is complete and tested (132+ backend tests): auth,
> jobs, proposals, bids, wallet/escrow, contracts/delivery/disputes, special services,
> reviews, tickets, invoices, affiliate accrual, chat (Postgres + stubbed mirror),
> notifications, CMS/FAQ, admin KPIs. **What remains is breadth**: file uploads, account
> lifecycle/moderation side-effects, engagement extras, i18n/SEO, and real third-party
> integrations. Rough functional completeness vs. the SRS mandatory set: **~70%**.

---

## 1. Module-by-module status

### 4.1 Authentication (FR-AUTH)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-AUTH-1..6 | Google SSO → JWT, refresh rotation, registration flag, frozen block | ✅ | — |
| FR-AUTH-7 | Auth-event audit log (login/logout/refresh/failures) | 🟡 | `AuditLog` exists; auth events not consistently recorded |
| FR-AUTH-8 | Staff 2FA (django-otp) on Unfold admin | ❌ | no OTP; staff login is password-only |

### 4.2 Modes (FR-MODE) — ✅ complete (toggle, relationship authz, cross-view deep links via notification `deep_link`).

### 4.3 Profiles (FR-PROF)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-PROF-1/2 | Profile + skills/education/employment/languages | ✅ | — |
| FR-PROF-3 | Guided completion wizard (frontend) | ❌ | backend supports; no wizard UI |
| FR-PROF-4 | Public SEO worker profile page | ❌ | no public profile endpoint/page |
| FR-PROF-5 / BR-16 | Visibility + offline reminder email | 🟡 | setting exists; **no reminder Celery task** |
| FR-PROF-6 | ID verification (upload + admin approve, badge) | ❌ | not implemented |
| FR-PROF-7 / BR-2 | Account deletion with deletion guards | ❌ | no endpoint; BR-2 guard absent |
| FR-PROF-8 | Phone OTP (SMS) *(Should)* | ❌ | — |
| FR-PROF-9 | Notification preferences | ❌ | no preference model/UI |

### 4.4 Bids (FR-BID)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-BID-1/3/4/5/6 | consume, plan purchase, admin CRUD, grants, refunds | ✅ | — |
| FR-BID-2 | usage history (month/year/all/custom) view | 🟡 | balance only; no period breakdown endpoint |

### 4.5 Jobs (FR-JOB)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-JOB-1..10,13..17, BR-4/5/6/6a | post→moderate→publish→propose→accept→award, watchlist, invite, expiry | ✅ | — |
| FR-JOB-1 | **attachments** on jobs | ❌ | no file upload (cross-cutting, §2) |
| FR-JOB-11 | Repost (public/private/to worker) | ❌ | `source_job` field exists, unused |
| FR-JOB-12 | Rehire a worker (private pre-filled job) | ❌ | — |

### 4.6 Special Services (FR-SVC) — ✅ core complete. Gaps: **images/attachments** on services & requests (❌, cross-cutting).

### 4.7 Contracts & Delivery (FR-TASK) — ✅ complete (funding, escrow, delivery, accept/reject, update requests, mutual cancel, disputes BR-22, overdue, warranty). Gap: submission **file attachments** (🟡 stored as JSON URLs, no upload pipeline).

### 4.8 Chat (FR-CHAT)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-CHAT-2/3/7/8/9, BR-10/11 | 1:1 conversations, inbox, read-only lifecycle, kill-switch, admin oversight | ✅ | — |
| FR-CHAT-6/12 | 10-min unread-email fallback | ✅ | — |
| FR-CHAT-1 | **Real Firebase/Firestore + real-time listeners** | 🟡 | Postgres is source of truth; Firestore mirror is a **stub**; FE uses **polling**, not real-time |
| FR-CHAT-4 | Message types: files/images/audio | 🟡 | text only; `files` JSON unused (needs upload) |
| FR-CHAT-5 | Delivery state sent/delivered/read | 🟡 | read-cursor only (no delivered state) |
| FR-CHAT-10 | Abuse report + admin queue *(Should)* | ❌ | — |

### 4.9 Wallet & Payments (FR-PAY)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-PAY-1/3/5/6/7/9, BR-9/24 | wallet buckets, ledger, withdrawals, escrow, commission, invoices | ✅ | — |
| FR-PAY-2 | Deposit (PayPal) | ✅ | card/Fawry intentionally dropped (PayPal-only product decision) |
| FR-PAY-4 | Saved payment methods (tokenized) | ❌ | no `PaymentMethod` model |
| FR-PAY-6 / §4.15 | **Commission ranges** (admin-managed type+ranges) | 🟡 | implemented as a flat `payments.commission_pct` setting, not range tables |
| FR-PAY-8 | Admin transactions + platform wallet ops | 🟡 | read views exist; platform-wallet withdraw/payout-methods UI thin |

### 4.10 CMS (FR-CMS) — ✅ pages + FAQ + legal CRUD and public API. Gap: **SSR + SEO** (JSON-LD, sitemaps, metadata) ❌ (§2 cross-cutting); translation-ready fields 🟡.

### 4.11 Reviews (FR-REV) — ✅ complete (one-per-party, edit-in-warranty/lock, aggregates, admin). Gap: like/dislike summary 🟡.

### 4.12 Notifications (FR-NOT)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-NOT-1/2/5/6 | in-app center, push (stub), history, email kill-switch | ✅ | — |
| FR-NOT-3 | Admin compose broadcast (audience targeting) | ❌ | — |
| FR-NOT-4 | Schedule notifications | ❌ | — |

### 4.13 Subscriptions (FR-SUB) — ✅ subscribe + async email fan-out + admin config. Gap: push on publish 🟡 (FR-SUB-4, Should).

### 4.14 Tickets (FR-TKT)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-TKT-1/3/4/5, BR-22 | submit, reply, solve, close, dispute coupling, auto-solve/close | ✅ | — |
| FR-TKT-2 / BR-14 | Full status names: Open→**Pending**→**On-Hold**→Solved→Closed | 🟡 | implemented as open/answered/solved/closed; missing On-Hold + reason, Pending semantics |
| FR-TKT-1 | attachments | ❌ | cross-cutting upload |

### 4.15 Affiliate (FR-AFF)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-AFF-3/4/5, BR-18 | attribution, range rules, accrual at warranty, clawback, freeze | ✅ | — |
| FR-AFF-1 | Stats incl. **clicks** | 🟡 | earnings/referrals tracked; no click tracking |
| FR-AFF-2 | **Custom slug** + social share | ❌ | slug auto-generated, not user-editable; share is FE-only |
| FR-AFF-3 | **Cookie attribution** on link visit | 🟡 | attribution is by explicit `slug` POST; no visit-cookie endpoint |

### 4.16 Admin (FR-ADM)
| Ref | Item | Status | Gap |
|---|---|---|---|
| FR-ADM-1/2, ADM-2 | Unfold admin, Global Settings, dashboard KPIs | ✅ | — |
| FR-ADM-3 | Maintenance mode (503 + Arabic page, admin stays up) | ❌ | setting exists; **no middleware** |
| FR-ADM-4/5, BR-23 | User freeze/activate/delete + **freeze side-effects** | 🟡 | login-block only; unlisting/contract-pause/conv-read-only/affiliate-stop **missing** |
| FR-ADM-8 / ADM-8 | Staff roles (Super/Ops/Finance/Support/Content) groups | ❌ | — |
| ADM-3 | CSV/XLSX export on key models | ❌ | — |
| ADM-9 | Analytics widgets (funnel, heatmap, top users) *(Should)* | 🟡 | KPI cards only |

### 5.x Non-functional
| Ref | Item | Status | Gap |
|---|---|---|---|
| NFR-LOC-1 | Arabic RTL UI | ✅ | strings present but hard-coded |
| NFR-LOC-2/3 | **i18n message catalogs** (next-intl + gettext), no hard-coded strings | ❌ | strings hard-coded in services/components |
| NFR-UX-1/2/3 | Responsive, WCAG 2.1 AA, confirm dialogs | 🟡 | RTL built; not audited; some confirms exist |
| NFR-MNT-2 | Test coverage + CI gates | 🟡 | backend strong; **no FE tests**, no coverage gate (see TESTING_STRATEGY.md) |
| NFR-MNT-3 | OpenAPI schema | ✅ | drf-spectacular live |
| NFR-MNT-4 | Observability (Sentry, metrics, ledger-invariant alerts) | 🟡 | JSON logging only |
| NFR-REL-2/3 | Backups/PITR; idempotent retried jobs | 🟡 | jobs idempotent; backups = infra |
| SEC-1/2/4/6 | server-side authz, OWASP, security headers | ✅/🟡 | prod headers set; rate-limit partial; CSP TODO |
| SEC-3 | Firebase via backend-minted tokens, Firestore rules | ❌ | real Firebase not wired |
| SEC-11 / AC-13 | dependency scan in CI; **pen-test** | ❌ | external engagement |

---

## 2. Cross-cutting gaps (affect many modules — do these as platforms, once)

1. **File upload & storage pipeline** ❌ — needed by jobs, proposals, services, submissions,
   chat, tickets, ID verification. There is **no `FileField`/upload endpoint anywhere** today
   (attachments are placeholder JSON URL lists). Build once: S3-compatible storage
   (`django-storages`), a presigned-upload or multipart endpoint, MIME/size validation
   (`uploads.max_file_mb` setting already exists), and an `Attachment` model reused everywhere.
2. **i18n externalization** ❌ — `USE_I18N=True` but no `LocaleMiddleware`, no gettext usage,
   no message catalogs; Arabic strings are hard-coded (violates NFR-LOC-2). Backend: wrap
   user-facing strings in `gettext`; frontend: adopt `next-intl` with an `ar` catalog.
3. **SEO / SSR** ❌ — public pages (jobs, services, profiles, CMS) are client-rendered with no
   JSON-LD, sitemaps, robots, or metadata (AC-12, FR-CMS-1/2). Needs SSR/metadata + structured data.
4. **Real third-party integrations** 🟡 — Firebase/Firestore + FCM, PayPal live, an email
   provider (SMTP/SES), and SMS OTP all run as **stubs**. Production needs real adapters + creds.
5. **Freeze side-effects (BR-23) & account deletion (BR-2)** ❌ — the moderation/lifecycle
   "ripple" logic is the main missing business workflow.

---

## 3. Implementation roadmap (Phases 10–15)

Effort: **S** ≤1d · **M** 2–4d · **L** ≥1w. Each phase ends with tests + lint green and a README update.

### Phase 10 — Attachments & file storage *(unblocks 6 modules)*  · **L**
- `Attachment` model + `django-storages` (S3/MinIO), presigned-upload endpoint, MIME/size guard.
- Wire into jobs, proposals, services, submissions, chat messages, tickets.
- **AC:** upload→attach→download round-trips; type/size rejected with Arabic error; files scoped to owner.

### Phase 11 — Account lifecycle & moderation *(core business workflows)* · **L**
- **FR-ADM-4/5 + BR-23 freeze ripple:** freeze → unlist jobs/services, suspend proposals/invitations, pause active contracts (notify + offer cancel), conversations read-only, stop affiliate accrual; reactivate restores.
- **FR-PROF-7 + BR-2 account deletion:** guard (in-progress contract / non-zero wallet / unsettled withdrawal / pending request), soft-delete + anonymize + retain ledger.
- **FR-ADM-3 maintenance mode** middleware (503 + Arabic page; admin exempt).
- **FR-PROF-6 ID verification** (upload + admin approve/reject + Verified badge).
- **FR-AUTH-8 staff 2FA** (django-otp) + **FR-ADM-8 staff role groups** (least-privilege).
- **AC:** AC-1b dual-role integrity holds through a freeze; deletion blocked per BR-2; maintenance page verified.

### Phase 12 — Engagement completeness · **M**
- **FR-NOT-3 broadcast** (audience: users/all-workers/all-employers/everyone, activity-based) + **FR-NOT-4 scheduled** notifications (Celery ETA) + history.
- **FR-PROF-9 notification preferences** (+ enforce in `notify()`); **FR-PROF-5/BR-16 offline-reminder** Celery task.
- **FR-TKT-2/BR-14** add On-Hold (with reason) + Pending semantics to the ticket state machine.
- **FR-CHAT-10** abuse report + admin review queue *(Should)*.
- **AC:** AC-8 broadcasts deliver to chosen audience; kill-switch instant; reminder fires at threshold (clock-forced).

### Phase 13 — Marketplace & money extras · **M/L**
- **FR-JOB-11 repost** + **FR-JOB-12 rehire** (reuse `source_job`).
- **FR-PAY-4 saved payment methods** (tokenized, masked) ; **§4.15 commission ranges** (admin range tables replacing the flat pct, frozen on contract).
- **FR-AFF-1/2/3** click tracking + cookie attribution endpoint + user-editable unique slug + social share.
- **FR-BID-2** usage-history endpoint; **FR-PROF-4** public worker profile page.
- **AC:** AC-3 repost path; AC-10 click→registration→transaction attribution within cookie window.

### Phase 14 — i18n, SEO & frontend polish · **L**
- Externalize all strings: `next-intl` (`ar` catalog) + Django `gettext`; `LocaleMiddleware`; locale-ready URLs.
- SSR + metadata + JSON-LD (JobPosting/FAQPage/Person) + sitemaps + robots; **FR-PROF-3** completion wizard.
- Accessibility & responsive audit (WCAG 2.1 AA; 360/768/1280/1920); confirm dialogs everywhere.
- Frontend test suite (Vitest/MSW/Playwright) per `TESTING_STRATEGY.md`.
- **AC:** AC-2 no untranslated strings + adding a locale needs no schema change; AC-12 Lighthouse SEO ≥95; AC-14 responsive.

### Phase 15 — Real integrations & launch hardening · **L**
- Real **Firebase/Firestore** (backend-minted custom tokens, security rules, client real-time listeners replacing polling) + **FCM** push; **PayPal live**; **email provider**; **SMS OTP**.
- Observability: **Sentry** (FE+BE), structured logs, metrics, **ledger-invariant alerting** (NFR-MNT-4).
- Security: CSP, full rate-limit matrix, `pip-audit`/`npm audit`/Trivy + secret scanning in CI; **wallet/escrow pen-test** (AC-13).
- Ops: automated **PostgreSQL backups + PITR**, restore runbook, zero-downtime deploy + rollback drill (NFR-REL-2, AC-15).
- **AC:** AC-6 real-time chat ≤2s + FCM on web; AC-13 security checklist; AC-15 backup/restore + maintenance drills.

---

## 4. Explicitly deferred / out-of-band
- The **penetration test** (SEC-11/AC-13) is an external engagement — schedule before wallet go-live.
- Real **payment/Firebase/SMS credentials** and **infra** (backups, monitoring stack, CDN) are provisioning tasks, not code.
- Card/Fawry deposit rails: **intentionally dropped** for the PayPal-only launch decision (revisit if scope changes).

---

## 5. Recommended sequence
**Phase 10 first** (attachments unblock the most modules and are referenced across jobs/chat/
tickets/ID), then **Phase 11** (the highest-value missing *business* logic: freeze ripple +
deletion + moderation), then 12→13 for breadth, with **14 (i18n/SEO)** and **15 (real
integrations + hardening)** as the launch gate. Phases 10–13 are pure feature work with the
same test rigor as Phases 4–9; Phase 15 is where external credentials and the pen-test land.
