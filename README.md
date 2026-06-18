# شغل أونلاين — ShoghlOnline

Arabic-first job & services marketplace. One account, two switchable views (Find Job ⇄ Find Worker), Google-SSO-only auth, escrow-protected payments.

| Artifact | Where |
|---|---|
| Requirements (SRS v1.1, 25 sections + appendices) | `ShoghlOnline_SRS_v1.1.docx` |
| Design plan + living design system (44 RTL screens) | `design/DESIGN_PLAN.md` → open `design/index.html` |
| Design QA | `design/QA_REPORT.md` |
| Figma mirror (partial) + rebuild scripts | `figma_v2_scripts/` |
| Backend (Django 5 · DRF · Celery · Unfold) | `backend/` |
| Frontend (Next.js 14 · Tailwind · RTL) | `frontend/` |

## Quick start

```bash
cp .env.example .env        # defaults are fine for dev (stub Google login enabled)
make up                     # db + redis + backend :8000 + worker + beat + frontend :3000
```

Then:
- App: http://localhost:3000 → «دخول تجريبي» (stub) → mode selection → dashboard
- API docs: http://localhost:8000/api/docs/
- Admin (Unfold): http://localhost:8000/admin/ — `make superuser` first
- Global Settings live in admin → Platform Core → Global settings (changes apply ≤60s, SRS §22)

### Real Google sign-in
Create an OAuth 2.0 Web Client (console.cloud.google.com), authorize `http://localhost:3000`, put the client ID in `.env` (`GOOGLE_OAUTH_CLIENT_ID=…`, set `GOOGLE_AUTH_STUB=0`), restart.

## Tests & lint

```bash
make test     # backend: pytest (11 tests — auth, registration flag, frozen, mode, settings, profile)
make lint     # ruff + tsc
```

## What's implemented

**Phase 0–1 (foundations + identity):**
- Google SSO exchange → JWT (15-min access, rotating refresh + blacklist) — FR-AUTH-1..6
- Registration feature-flag gate, frozen-account block — FR-AUTH-5, FR-ADM-5
- Mode toggle as pure view preference — FR-MODE-1..4, §3.1
- Worker profile (lazy-created) + skills/education/employment/languages — FR-PROF-1..3
- Categories & skills taxonomy, Global Settings (24-key catalog), audit log — §22, SEC-10
- OpenAPI at `/api/schema/`, Swagger at `/api/docs/`

**Phase 2 (jobs core):**
- Jobs: post → auto-publish or admin review queue (flag), close, auto-expiry sweeper with bid refunds — FR-JOB-1/2/7/17
- Public listings with filters/search/ordering — FR-JOB-3
- Proposals: bid consumption + refund rules (moderation reject / job closed), required screening answers, self-dealing blocked at API level, BR-4 title lock, single award per job (row-locked) — FR-JOB-5/6/8/9, FR-BID-1..6, BR-4/5/6/7/21
- Invitations (free proposals, auto-expire on award/close) — FR-JOB-10, BR-6a
- Watchlist — FR-JOB-4
- Bid ledger (append-only) + signup grant + plans — FR-BID
- Category subscriptions + Celery email fan-out (skips the poster, kill-switch aware) — FR-SUB-1..3
- Unfold admin: job/proposal moderation queues with bulk approve/reject + audit
- Frontend: `/jobs` (filters), `/jobs/[slug]` (detail + proposal form with bid counter and screening), `/jobs/new` (post with screening builder + moderation notice)
- 27 backend tests green (11 identity + 16 jobs-core rules)

**Phase 3 (money — PayPal only, per product decision):**
- Wallet with the three SRS buckets (available / escrow-held / earnings-pending) — FR-PAY-1
- Append-only double-entry ledger; balances always = Σ succeeded rows; idempotency keys dedupe gateway retries — FR-PAY-9, AC-5
- PayPal deposits: pending tx shown immediately → capture on return → 5-min reconciliation sweep for lost webhooks — FR-PAY-2 (stub mode for dev, live REST v2 code ready for credentials)
- Withdrawals (PayPal only): amount held instantly on request (no double-spend window), admin pay/reject queue, rejection auto-reverses — FR-PAY-3
- Bid-plan purchase from the wallet — FR-BID-3
- Currency: **USD** (`platform.currency` setting — PayPal doesn't support KWD); commission default 10% (`payments.commission_pct`, pending final rates)
- Frontend `/wallet`: 3 balance cards, PayPal charge flow, withdraw form + history, ledger table
- 40 backend tests green (13 new money tests incl. idempotent replay and hold-reversal)

**Phase 4 (contracts & delivery):**
- Contract auto-created on proposal accept; binds employer/worker/scope/budget/deadline with commission **frozen at creation** (FR-TASK-1, FR-PAY-6)
- Funding: `available → escrow_held`; activates immediately if funded, else **Pending Funding** with a 48h auto-cancel that returns the job to Published and reverts the winning proposal (BR-6a). Siblings auto-reject + job → In Progress **only on Active** (BR-6)
- Delivery: worker submissions (notes+files), first open submission → Delivered; employer accept (→ Completed, escrow splits to worker earnings-pending + platform commission, warranty starts) or reject with reason (→ back to Active, resubmit) — FR-TASK-3/4, FR-PAY-5
- Warranty release sweeper: `earnings_pending → available` at warranty end, atomic + idempotent (BR-10)
- Update requests both directions: budget increase reserves the diff (parks the *change* in pending-funding if short), decrease refunds it, deadline changes — FR-TASK-5
- Mutual cancellation (request + counterpart confirm → full escrow refund) and admin **dispute resolution** with the BR-22 picker: resume / complete / cancel / **split** (refund X% + payout minus recalculated commission), every leg an explicit ledger row
- BR-24 rounding invariant (`hold == worker_earning + commission`, exactly) asserted across the suite
- Celery sweepers: funding-timeout (BR-6a), warranty-release (BR-10), overdue-notifier (FR-TASK-9)
- Unfold admin: contract oversight, overdue flag, dispute-resolution actions; frontend `/contracts` (dual-role list + filters) and `/contracts/[id]` (fund, deliver, accept/reject, update requests, cancel, dispute, timeline)
- **72 backend tests green** (32 new contract tests incl. clock-forced warranty release, dispute split, funding timeout, double-accept)

**Phase 5 (chat & notifications):**
- 1:1 conversations with **Postgres as source of truth + a Firestore mirror** adapter (stub in dev, `FIRESTORE_STUB`); messages, files, per-user read cursors and unread counts — FR-CHAT, §10.4
- BR-11 initiation rules: employer opens a chat from a proposal, both contract parties chat freely; **workers can't cold-message** employers; self-chat blocked (BR-21). Contract conversation auto-opens on funding
- `chat.enabled` kill-switch disables sending platform-wide; banned-words filter (`chat.banned_words`)
- **Warranty-end read-only flip (BR-10) now closed**: `release_warranty` releases funds *and* flips the conversation read-only in Postgres + the Firestore mirror in one atomic transition; idle non-contract conversations lock after `conversations.idle_lock_days` (FR-CHAT-7)
- Notifications: one `notify()` fan-out writes the in-app row + email (honoring `emails.enabled`) + **FCM push (stub, `FCM_STUB`)**; every contract event notifies both parties (FR-TASK-7, FR-NOT)
- **10-minute unread-email checker** sends exactly one email per message left unread past the delay, none if read in time (AC-6)
- Frontend: `/messages` (conversation list + unread badges), `/messages/[id]` (RTL thread, composer disabled when read-only/kill-switch), a notifications 🔔 bell with unread count + mark-all-read, and an "open chat" action on contracts
- **89 backend tests green** (17 new chat/notification tests incl. warranty-end flip, kill-switch, cold-message block, unread-email-once)

**Phase 6 (reviews & tickets):**
- Mutual reviews tied to **completed contracts only** — one per party, 1–5 + comment, subject is always the counterpart, self-review blocked (FR-REV-1/4, BR-21)
- **Editable within the warranty window, locked after** — the warranty-end transition (BR-10) now releases funds + flips chat read-only + locks reviews in one atomic step; a review created after warranty end is born locked (FR-REV-2, BR-13)
- Profile rating aggregates kept in sync per direction (worker vs employer ratings) on `WorkerProfile`/`EmployerProfile` (AC-7); public `GET /users/{id}/reviews` with summary
- Support tickets with the full status machine **open → answered → solved → closed** (closed = read-only); admin-managed ticket types; auto-solve + auto-close Celery sweepers (FR-TKT, AC-9)
- **Dispute↔contract coupling (BR-22)**: a dispute-type ticket against a contract flags it Disputed, and the ticket **cannot be closed until the dispute is resolved** — the admin BR-22 picker moves the contract out of Disputed first
- Frontend: review stars + comment (edit-in-warranty) on completed contracts, `/support` (ticket list + new) and `/tickets/[id]` (thread)
- **102 backend tests green** (13 new reviews/tickets tests incl. edit-then-lock, aggregates, status machine, dispute-close gating)

**Phase 7 (special services — the second engagement model):**
- Workers publish productized **Services** (gigs) with a base price, delivery time, and optional paid **add-ons**; publish flows through the same moderation gate as jobs (`services.auto_publish` → live or pending-review), with pause/resume/archive — pause hides from discovery **without touching running contracts** (§9.3)
- Discovery: public `GET /services` (filter/search/sort) + **favourites** (♥), service detail with live add-on/quantity total
- Employers send a **buying request** (quantity + add-ons + description); total = (base + add-ons) × qty, frozen at request time; **self-buy blocked** (BR-21)
- Worker accepts → a **Contract is created and funded through the exact same escrow/delivery/warranty/commission/dispute layer** as jobs (`create_contract_from_request`); reject/cancel-before-accept supported (FR-SVC-7, AC-4)
- `Contract` now supports both origins (job/proposal **or** service/buying-request); job-specific side-effects are guarded so a gig can run many concurrent contracts
- Frontend: `/services` (browse + favourite), `/services/[slug]` (buy with add-ons/qty/total), `/me/services` (create, publish, pause/resume, accept/reject incoming requests)
- **115 backend tests green** (13 new service tests incl. add-on totals, self-buy block, pause-without-touching-contracts, full buy→deliver→complete)

**Phase 8 (revenue & growth — invoices + affiliate):**
- **Period invoices (FR-PAY-7)**: a worker requests an invoice for their completed contracts with one employer over a week/month period; the employer confirms and the platform **generates a PDF** (reportlab) — reject supported; `InvoiceRequest` links worker, period and the contract line set
- **Affiliate/referral (FR-AFF, BR-18)**: per-user referral slug/link, attribution within the cookie window (`affiliate.cookie_days`), **self-referral void** (BR-21)
- Range-based commission rules (worker/employer/any → rate); **affiliate commission accrues at warranty release** (not acceptance), crediting the referrer's wallet, with idempotent accrual and a **clawback** path; frozen affiliates earn nothing (FR-ADM-5)
- New `affiliate` ledger transaction type; accrual wired into the BR-10 warranty-release transition alongside fund-release + chat-lock + review-lock
- Unfold admin: commission-rule CRUD, users' commissions (freeze/activate, clawback action), invoice queue
- Frontend: `/invoices` (worker request + employer confirm/PDF), `/affiliate` (referral link, earnings, referral history)
- **128 backend tests green** (13 new incl. accrual-at-warranty, range-rule selection, freeze-stops-accrual, clawback, invoice period gather + PDF confirm)

**Phase 9 (CMS + admin analytics):**
- **Content pages + FAQ (ADM-6)**: `ContentPage` (about/terms/privacy…) and `FAQItem` with admin CRUD; public `GET /pages`, `/pages/{slug}`, `/faqs` (unpublished hidden); frontend `/pages/[slug]` and an accordion `/faq`
- **Admin analytics dashboard (ADM-2)**: a KPI service computing users + activity segments, active jobs/services, proposals today, **GMV**, platform commission, **wallet liabilities by bucket**, open tickets, pending-moderation counts, disputes and overdue contracts — surfaced as cards via the Unfold `DASHBOARD_CALLBACK` and a staff-only `GET /api/v1/admin/stats`
- **132 backend tests green** (4 new: CMS publish-gating, KPI correctness, staff-only stats access)

## Next (launch hardening — infra, mostly out-of-band)
Submission file uploads/storage, JWT → httpOnly cookies, env-driven frontend URLs, and the mandatory wallet/escrow penetration test (SEC-11/AC-13 — an external engagement). All functional SRS requirements are now implemented and tested.
