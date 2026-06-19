# Slide 40 — استلام الأرباح (تحويل بنكي) (payout: bank transfer / IBAN)

- **Module:** Account Settings · استلام الأرباح · bank transfer modal
- **PPT screen:** «إضافة حساب بنكي لاستلام الأرباح».
- **Status:** ❌ missing

## 1. What the slide proposes
Modal (دولي): **اسم صاحب الحساب**, **رقم IBAN**, **اسم البنك**, **الفرع**, **رمز SWIFT/BIC**,
**الدولة** (select), **المدينة**, **اسم مستعار (اختياري)**, **تعيين كوسيلة استلام افتراضية**.
Note «يجب أن يطابق اسم صاحب الحساب اسمك المسجل في المنصة». «بياناتك البنكية محفوظة بأمان».

## 2. Current state in the codebase
- None. No bank/IBAN payout support anywhere.

## 3. Gap
Entire bank-transfer payout rail missing (model details + validation + modal).

## 4. Plan

### Backend
1. `PayoutMethod` kind=`bank_transfer`, details `{account_holder, iban, bank_name, branch,
   swift_bic, country, city}`. Validate IBAN/SWIFT format; enforce account-holder ≈ platform
   name (or warn). Via `POST /me/payout-methods`.

### Frontend
2. `AddBankPayoutModal` with the fields above (country select), nickname, set-default; the
   name-match note; opens from the payouts hub (`slide-38`).

## 5. Acceptance criteria
- A bank/IBAN payout method saves with validated IBAN/SWIFT and appears in the list; name-
  match guidance shown.

## Dependencies
Parent: `slide-38`. Shares `PayoutMethod` with 39/41/42.
