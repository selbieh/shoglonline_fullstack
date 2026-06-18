# PART 06B — Admin Panel Integration & Moderation Console

**Goal:** make the **Django Unfold** admin a complete operational console — every module
manageable, every moderation queue wired, KPIs/exports/bulk-actions/audit in place — and
**tested**. The backend already has Unfold + a KPI `dashboard_callback`; this part closes the
SRS Section 21 (ADM-1…9) surface as a first-class concern instead of scattered touches.
**Depends on:** Parts 03–06 (the entities the queues moderate); composes with Part 04 (freeze, ID verify, 2FA, staff roles) and Part 05 (broadcast/scheduled, ticket On-Hold, reports).
**SRS refs:** ADM-1…9, §9.9 (moderation workflow), §22 (flags), AC-11, BR-17/22. **Effort:** M/L

## Steps

### ADM-1 — structure & theme
1. [x] Verify/complete the Unfold sidebar **grouped by domain**: Users · Marketplace · Money · Engagement · Support · Content · System. RTL-capable, branded, dark/light. Confirm `config/unfold.py` registers every model under the right group.

### ADM-2 — dashboard completeness
2. [x] Audit `apps/core/analytics.dashboard_callback` against the ADM-2 list and fill gaps: total/new users, **activity segments** (worker-active / employer-active / dual-active — *activity-based, never view-toggle*), active jobs, proposals today, **GMV**, platform commission, **wallet liabilities by bucket**, open tickets, **pending-moderation counts**, **overdue contracts**; charts (registrations/jobs/revenue over time) + **date-range selector**.

### ADM-3 — list views & exports
3. [x] Every list view: advanced filters (status/category/date-range/flags), column sorting, global search (Unfold command palette + per-model `search_fields`), pagination. Add **CSV/XLSX export** on key models (users, jobs, proposals, contracts, transactions, withdrawals, tickets, invoices, affiliate commissions).

### ADM-4 — bulk actions (with audit)
4. [x] Bulk approve/reject (jobs, proposals, services), archive, freeze/activate users, mark tickets, **resend notifications** — each with a confirmation dialog and an `AuditLog` row (before/after).

### ADM-5 — moderation queues
5. [x] Pending queues with **side-by-side detail preview**, one-click **approve / reject-with-reason** (reason templates), and automatic notifications to affected users. Queues: pending jobs, pending proposals (when `proposals.auto_publish` OFF), pending services, ID verifications, withdrawals, invoice requests, chat reports, **disputes (BR-22 resolution picker)**, overdue contracts.

### ADM-6 — full module coverage (checklist — confirm each screen exists & is wired)
6. [x] Manage Users (view/search/freeze/activate/delete w/ **BR-2 guard**) · Bid Plans CRUD · Job Types/Categories CRUD · Employers' Jobs · Proposals (approval) · Special Services + Buying Requests · Submissions + Update Requests · **Conversations oversight** (read/search/archive) · Transactions + **Platform Wallet** (withdraw, payout methods) · Content Pages + FAQ CRUD · Reviews (edit/delete/search) · Notifications (push now / schedule / history) · Ticket Types + Tickets (filter/sort/reply/hold/close-report) · Affiliate Commission Types + Users' Commissions (freeze/activate) · **Global Settings** (every §22.1 flag, effect ≤60s).

### ADM-7 — inline relations & ledger safety
7. [x] Inline relations: proposals inline on the job page, replies inline on the ticket, transactions inline on the wallet. **Read-only ledger** — no manual balance edits anywhere; corrections only via an explicit `ADJUSTMENT` transaction with reason (keeps BR-9/24 invariant intact).

### ADM-8 — staff roles (cross-ref Part 04)
8. [x] Confirm Django groups Super/Ops/Finance/Support/Content with **least-privilege** per-model permissions; every staff action audit-logged. (2FA enforced in Part 04.)

### ADM-9 — analytics widgets (Should)
9. [x] Funnel (visit→signup→first action), category heatmap, top workers/employers, affiliate performance — aggregate queries or a light analytics store.

## Tests to add (`tests/integration/test_admin_*.py`, `tests/security/`)
- `test_admin_permissions.py` — 🔐 every admin action × {anon, normal user, wrong-role staff, right-role staff} → expected status; non-staff blocked from `/admin/*` and `/admin/stats`.
- `test_admin_moderation.py` — ✅ approve publishes + notifies; **reject-with-reason** sets status + sends the Arabic reason; ⛔ reject without reason blocked; BR-17 archive (soft-delete) never hard-deletes.
- `test_admin_bulk_actions.py` — ✅ bulk approve/reject/freeze/activate apply + write `AuditLog` (before/after) + fire notifications.
- `test_admin_dispute_resolution.py` — BR-22 picker posts the correct refund/payout ledger legs and closes the coupled ticket; contract never left Disputed.
- `test_admin_ledger_readonly.py` — 🛡 wallet balances are read-only in admin; only an `ADJUSTMENT` transaction can move them (invariant still holds).
- `test_admin_exports.py` — CSV/XLSX export returns rows for key models; respects filters.
- Extend `unit/test_analytics_kpis.py` — every ADM-2 KPI computes (segments activity-based; liabilities split by bucket); dashboard staff-only.
- `test_settings_flags.py` — every §22.1 flag is editable in admin and takes effect ≤60s server-side (BR-19), tested in **both** states.

## Exit criteria (maps **AC-11**)
- [x] Unfold dashboard KPIs/charts render with the full ADM-2 metric set + date range.
- [x] Every module from ADM-6 is present and wired; every list view has filters/search/sort + CSV/XLSX export.
- [x] Moderation queues (incl. disputes BR-22, ID, withdrawals, reports, overdue) work with reason templates + auto-notify; bulk actions audited.
- [x] Ledger is read-only in admin (adjustments only via transactions); staff roles least-privilege; every §22.1 flag togglable with effect ≤60s.
- [x] All admin permission/moderation/bulk/dispute/export tests green.
