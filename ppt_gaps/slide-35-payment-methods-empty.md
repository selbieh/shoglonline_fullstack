# Slide 35 — إدارة وسائل الدفع (خالية) (manage payment methods — empty)

- **Module:** Account Settings · وسائل الدفع (empty state)
- **PPT screen:** «الإعدادات → وسائل الدفع» (no methods saved).
- **Status:** ⚠️ partial

## 1. What the slide proposes
- Title «وسائل الدفع — احفظ وسائل الدفع الخاصة بك لتسريع عملية الدفع وشحن الرصيد».
- Empty state illustration + «لا توجد وسائل دفع محفوظة».
- Two add CTAs: **إضافة بطاقة بنكية** / **إضافة حساب PayPal**.
- Note «الطرق المدعومة حاليًا: البطاقات البنكية و PayPal» + «بياناتك محفوظة بأمان».

## 2. Current state in the codebase
- `components/PaymentMethods.tsx` renders an empty state («لا توجد وسائل دفع محفوظة») but it's
  embedded inside `app/wallet`, not a dedicated settings page, and offers PayPal add only.

## 3. Gap
No dedicated `/settings/payment-methods` page; empty state lacks the two distinct add CTAs
(card vs PayPal) wired to the add modal (`slide-34`).

## 4. Plan

### Frontend
1. Create `frontend/app/settings/payment-methods/page.tsx` under the settings shell
   (`slide-30`), reusing/refactoring `PaymentMethods.tsx`.
2. Empty state: illustration + the two CTAs (إضافة بطاقة بنكية / إضافة حساب PayPal), each
   opening the corresponding tab of `AddPaymentMethodModal` (`slide-34`).
3. Supported-methods + security note.

### Backend
4. None new (reuse `/me/payment-methods`).

## 5. Acceptance criteria
- The settings payment-methods page shows the empty state with both add CTAs that open the
  add modal on the right tab.

## Dependencies
Add modal `slide-34`; filled state `slide-36`; shell `slide-30`.
