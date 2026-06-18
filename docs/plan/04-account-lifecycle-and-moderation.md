# PART 04 — Account Lifecycle & Moderation (the main missing *business* logic)

**Goal:** the moderation/lifecycle "ripple" workflows that the transactional core doesn't yet have.
**Depends on:** Parts 01–02 (03 if ID-verification uploads are included here).
**SRS refs:** FR-ADM-3/4/5, FR-PROF-6/7, FR-AUTH-8, BR-2/3/23. **Reference:** GAP Phase 11.
**Flags:** `platform.maintenance_mode` (exists in §22.1). **Effort:** L

## Steps

### Freeze side-effects — BR-23 / FR-ADM-5 (highest value)
1. [x] `apps/accounts/services.freeze_user(user, reason)` — atomically: block auth (already), **unlist** their published jobs & services, **suspend** open proposals/invitations, **pause** active contracts (notify counterpart + offer cancel-with-full-refund or admin dispute), flip their conversations **read-only**, **stop** affiliate accrual. Escrow holds & scheduled warranty releases stay intact until each contract resolves.
2. [x] `unfreeze_user(user)` — restore listings, resume suspended proposals/invitations/contracts.
3. [x] Wire both into the Unfold admin user actions (bulk freeze/activate) with `AuditLog` entries + counterpart notifications.

### Account deletion — BR-2/BR-3 / FR-PROF-7
4. [x] `DELETE /me` (reason + optional text): **block** while any in-progress contract (pending_funding/active/delivered/disputed) on either side, non-zero wallet in **any** bucket, unsettled withdrawal, or pending service request — return the exact blockers + settlement paths. Else soft-delete, unpublish jobs/services, expire open proposals/invitations, anonymize public content, **retain financial ledger** immutably.

### Maintenance mode — FR-ADM-3
5. [x] Middleware: when `platform.maintenance_mode` is on, public site + API return **503 + Retry-After** with an Arabic maintenance page; `/admin/*` and staff stay reachable. Toggle takes effect ≤60s (flag cache TTL).

### ID verification — FR-PROF-6
6. [x] Upload national ID (uses Part 03), admin review queue (approve/reject + reason), `is_verified` badge on `WorkerProfile`; surface badge on public profile + cards.

### Staff security — FR-AUTH-8 / FR-ADM-8
7. [x] `django-otp` (TOTP) mandatory for all staff on the Unfold admin; enforce at login.
8. [x] Staff role groups (Super / Ops / Finance / Support / Content) with least-privilege model permissions; document the matrix.

### Auth audit — FR-AUTH-7
9. [x] Record sign-up/login/logout/refresh/failure events to `AuditLog` consistently.

## Tests to add
- `tests/integration/test_freeze_ripple.py` — ⚙/🪐 freeze unlists+suspends+pauses+read-onlys+stops-accrual; counterpart notified & offered cancel; reactivate restores; **escrow untouched** through the freeze (assert ledger). *(BR-23)*
- `tests/integration/test_account_deletion.py` — ⛔ blocked per each BR-2 condition with exact blockers; ✅ clean delete soft-deletes + anonymizes + **retains ledger** (BR-3).
- `tests/integration/test_maintenance_mode.py` — public 503+Retry-After, admin reachable, toggle ≤60s.
- `tests/integration/test_id_verification.py` — upload→admin approve→badge; reject+reason.
- `tests/security/test_staff_2fa.py` — staff login requires OTP; role groups restrict actions.

## Exit criteria (maps **AC-1 / AC-1b / AC-11**)
- [x] Freezing a mid-flight dual-role user applies every BR-23 effect and leaves wallet buckets correct (AC-1b holds through a freeze).
- [x] Deletion blocked per BR-2 with actionable messaging; clean deletion retains ledger.
- [x] Maintenance page verified (503 + Arabic, admin up); staff 2FA enforced; auth events audited.
