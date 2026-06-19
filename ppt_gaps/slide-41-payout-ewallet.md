# Slide 41 — استلام الأرباح (محفظة) (payout: e-wallet, Egypt)

- **Module:** Account Settings · استلام الأرباح · e-wallet modal
- **PPT screen:** «إضافة محفظة إلكترونية لاستلام الأرباح».
- **Status:** ❌ missing

## 1. What the slide proposes
Modal (مصر فقط): **الدولة** (مصر, locked), **رقم المحفظة**, **اسم صاحب المحفظة**, **مزود
المحفظة** (select: Vodafone Cash / Orange Cash / Etisalat Cash / WE Pay), **اسم مستعار
(اختياري)**, **تعيين كوسيلة استلام افتراضية**. «بيانات المحفظة محفوظة بأمان».

## 2. Current state in the codebase
- None.

## 3. Gap
Entire e-wallet payout rail missing; needs country gating (Egypt only) + provider enum.

## 4. Plan

### Backend
1. `PayoutMethod` kind=`e_wallet`, details `{wallet_number, holder, provider}` with
   `provider ∈ {vodafone_cash, orange_cash, etisalat_cash, we_pay}`, `country=EG` enforced.
   Gate availability to Egyptian users.

### Frontend
2. `AddEwalletPayoutModal`: country locked to مصر, wallet number, holder, provider select,
   nickname, set-default; opens from the payouts hub (`slide-38`). Hide the tile for non-EG
   users (or show disabled with reason).

## 5. Acceptance criteria
- An EG user can save an e-wallet payout method with a provider; non-EG users can't add it.

## Dependencies
Parent: `slide-38`. Region gating shared with `slide-42`. Shares `PayoutMethod` model.
