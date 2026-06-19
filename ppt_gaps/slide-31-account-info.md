# Slide 31 — معلومات الحساب (account information)

- **Module:** Account Settings · معلومات الحساب
- **PPT screen:** «الإعدادات → معلومات الحساب».
- **Status:** ⚠️ partial

## 1. What the slide proposes
- **الإسم الأول** / **الإسم الأخير** (first/last name).
- **البريد الإلكتروني** (email) — with **تغيير البريد الإلكتروني** (change email → sends a
  verification message to the new address before it's accepted).
- **إلغاء تنشيط الحساب** (deactivate) — profile hidden, notifications pause, reversible.
- **حذف الحساب** (delete) — permanent, irreversible.
- Buttons: **حفظ** / **إلغاء**.

## 2. Current state in the codebase
- `User`: first_name, last_name, email (unique, **immutable** — no change flow), status
  (active/frozen/deleted). Names editable via `PATCH /auth/me`.
- `DELETE /auth/me` — soft-delete with blocker checks (open contracts, wallet, withdrawals,
  service requests) + anonymization. Implemented.
- **No email-change flow**, **no user-initiated deactivate** (freeze exists but is admin-only
  per the freeze/unfreeze service).

## 3. Gap
Missing: email change (with re-verification), and a **user-initiated deactivate** (distinct
from delete). Names + delete already exist but need to live in this screen.

## 4. Plan

### Backend
1. **Email change**: `POST /auth/me/email/change` → store pending email + token, send
   verification to the new address; `POST /auth/me/email/verify` confirms and swaps. Guard
   uniqueness. (Note: today identity is Google SSO — confirm product intent; may require
   re-auth.)
2. **Deactivate**: add a user-initiated `POST /auth/me/deactivate` and `…/reactivate`
   reusing the freeze ripple (hide profile, pause notifications) but **self-service** and
   reversible. Distinguish `status=frozen` (admin) vs a self `deactivated` state if needed.

### Frontend
3. Settings → معلومات الحساب page: first/last name (PATCH `/auth/me`), email field +
   «تغيير البريد» modal (enter new email → confirmation notice), «إلغاء تنشيط الحساب»
   (confirm modal), «حذف الحساب» (existing flow with blockers + reason). Save/Cancel.

## 5. Acceptance criteria
- Names save; changing email sends a verification to the new address and only swaps after
  confirm; deactivate hides the account reversibly; delete keeps existing blocker behaviour.

## Dependencies
Settings shell `slide-30`. Accounts app (`auth/me`). Delete flow already present.
