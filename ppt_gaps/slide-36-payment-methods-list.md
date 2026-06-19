# Slide 36 — إدارة وسائل الدفع (تحتوي على وسائل مضافة) (methods list)

- **Module:** Account Settings · وسائل الدفع (populated)
- **PPT screen:** «الإعدادات → وسائل الدفع» (with saved methods).
- **Status:** ⚠️ partial

## 1. What the slide proposes
- **وسائل الدفع المحفوظة** list:
  - Visa ••4242 — **افتراضية** badge — «تنتهي في 12/26» — **تعديل** / **حذف**.
  - PayPal (email) — **تعيين كافتراضية** — **تعديل** / **حذف**.
- **+ إضافة وسيلة دفع جديدة** (→ `slide-34`).
- «بياناتك محفوظة بأمان» note.

## 2. Current state in the codebase
- `PaymentMethods.tsx` lists saved methods (PayPal email / card brand+last4), shows
  «افتراضي», supports «اجعلها افتراضية» (PATCH) and «حذف» (DELETE). Card add not present
  (`slide-34`); card expiry not displayed; «تعديل» (rename/label) limited.

## 3. Gap
Mostly built. Missing: card expiry display, full «تعديل» (edit label / set default) on both
types, and living under the settings shell as a page (not just inside wallet).

## 4. Plan

### Backend
1. Ensure `PaymentMethod` stores/returns card `exp_month/exp_year` for the «تنتهي في MM/YY»
   line (add fields if absent). `PATCH /me/payment-methods/<id>` already supports label +
   default.

### Frontend
2. In `/settings/payment-methods` (from `slide-35`), render the populated list per the slide:
   brand/last4 + default badge + expiry, PayPal email, تعديل (label/default modal) / حذف /
   تعيين كافتراضية, and «+ إضافة وسيلة دفع جديدة» → `slide-34`.

## 5. Acceptance criteria
- Saved methods list shows default badge + card expiry; user can set default, edit label,
  delete, and add a new method.

## Dependencies
Add modal `slide-34`; empty state `slide-35`; shell `slide-30`. Payments app.
