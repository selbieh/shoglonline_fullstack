# Slide 38 — استلام الأرباح (receive earnings / payout methods hub)

- **Module:** Account Settings · استلام الأرباح
- **PPT screen:** «الإعدادات → استلام الأرباح».
- **Status:** ❌ mostly missing — backend payouts are **PayPal-only**.

## 1. What the slide proposes
A hub of payout methods to add:
- **PayPal** (دولي) · **تحويل بنكي** (دولي) · **محفظة إلكترونية** (مصر فقط) · **بطاقة بنكية**
  (مصر فقط) · **Instapay** (مصر فقط).
- «اختر وسيلة لإضافتها» — clicking a tile opens its add modal (slides 39–42).
- Note: PayPal + bank transfer are international; e-wallet/bank-card/Instapay are Egypt-only.
- «بيانات استلام الأرباح محفوظة بأمان».

## 2. Current state in the codebase
- Withdrawals = `WithdrawalRequest` with **`paypal_email` only** (model comment: "PayPal-only
  payouts, product decision"). `app/wallet` has an inline PayPal withdraw form.
- **No payout-method model**, no bank/IBAN, e-wallet, Instapay, or bank-card rails.

## 3. Gap
The multi-rail payout system is absent. Need a saved-payout-method model + endpoints + a hub
UI, then per-rail modals (39–42). This is a significant backend addition.

## 4. Plan

### Backend
1. New model `PayoutMethod(user FK)`: `kind` (paypal / bank_transfer / e_wallet / bank_card /
   instapay), `is_default`, `label`, and a `details` JSON (kind-specific fields), plus
   `country` and validation per kind. Migration. (Keep `WithdrawalRequest`; add
   `payout_method` FK so a withdrawal targets a saved method.)
2. CRUD endpoints `GET/POST/PATCH/DELETE /me/payout-methods`. Gate Egypt-only kinds by
   country.
3. Update the withdraw flow to pick a saved `PayoutMethod` instead of a hardcoded PayPal email.

### Frontend
4. Create `frontend/app/settings/payouts/page.tsx` (settings shell): the 5 method tiles with
   region badges (دولي / مصر فقط), each opening its add modal (slides 39–42), a saved-methods
   list (default/edit/delete), and the security note.
5. Wire the الرصيد «سحب الرصيد» (`slide-32`) to choose among saved payout methods.

## 5. Acceptance criteria
- User can add/list/default/delete payout methods across the 5 rails (region-gated) and
  withdraw to a chosen saved method.

## Dependencies
Children modals: `slide-39` (PayPal), `slide-40` (bank), `slide-41` (e-wallet),
`slide-42` (Instapay). Balance/withdraw: `slide-32`. Shell `slide-30`. **Phase-1** backend
(new model). Region rules + currency theme T6.
