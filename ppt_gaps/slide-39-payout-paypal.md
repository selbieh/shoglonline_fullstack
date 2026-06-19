# Slide 39 — استلام الأرباح (PayPal) (payout: add PayPal)

- **Module:** Account Settings · استلام الأرباح · PayPal modal
- **PPT screen:** «إضافة حساب PayPal لاستلام الأرباح».
- **Status:** ⚠️ partial (PayPal payouts exist as a raw email field)

## 1. What the slide proposes
Modal: **البريد الإلكتروني الخاص بـ PayPal** (required), **اسم مستعار للحساب (اختياري)**,
**تعيين كوسيلة استلام افتراضية** checkbox, «بياناتك محفوظة بأمان», **حفظ الحساب** / **إلغاء**.

## 2. Current state in the codebase
- `WithdrawalRequest.paypal_email` is captured ad-hoc in the wallet withdraw form. No saved
  PayPal **payout method**.

## 3. Gap
Need a saved PayPal payout method (email + label + default) per the `PayoutMethod` model
(`slide-38`), surfaced as a modal.

## 4. Plan

### Backend
1. `PayoutMethod` kind=`paypal`, details `{paypal_email}` (validate email). Via
   `POST /me/payout-methods` (`slide-38`).

### Frontend
2. `AddPaypalPayoutModal`: email, optional label, set-default; opens from the payouts hub
   tile (`slide-38`); on save → POST and refresh the saved list.

## 5. Acceptance criteria
- A PayPal payout method saves with optional label + default and appears in the payouts list.

## Dependencies
Parent: `slide-38`. Model + endpoint shared with siblings 40–42.
