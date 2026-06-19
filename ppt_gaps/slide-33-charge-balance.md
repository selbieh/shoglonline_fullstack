# Slide 33 — شحن الرصيد (charge / top-up balance)

- **Module:** Account Settings · الرصيد · charge modal
- **PPT screen:** «إضافة رصيد» (two states: with saved methods / without).
- **Status:** ⚠️ partial

## 1. What the slide proposes
A modal:
- **المبلغ** (amount) + **quick amounts**: 50 / 100 / 250 / 500 ر.س.
- **وسائل الدفع المحفوظة** (saved methods radio): Visa ••6644 (الرئيسية), Mastercard ••1123,
  PayPal — or **+ إضافة وسيلة دفع** (→ `slide-34`).
- **القسائم** (coupon): code input + **تطبيق**.
- **ملخص العملية**: المبلغ · رسوم الخدمة (2.5%) · خصم القسيمة · **المجموع النهائي**.
- **شحن الرصيد** (disabled until a method is chosen / valid coupon) / **إلغاء**.
- Empty state: «لا توجد وسيلة دفع محفوظة» → **إضافة وسيلة دفع**.

## 2. Current state in the codebase
- `app/wallet` charge = an **inline** amount field → `POST /wallet/charge` → redirect to
  PayPal → `/wallet/charge/confirm`. **No modal, no quick amounts, no method selection
  (PayPal hardcoded), no coupon, no fee summary.**
- Backend: no coupon model; no service-fee line on charge; PayPal-only.

## 3. Gap
The charge modal (quick amounts, saved-method selection, coupon, 2.5% fee summary,
empty-state CTA) doesn't exist; backend lacks coupons and a fee-on-topup concept; card
charging not wired (PayPal only).

## 4. Plan

### Backend
1. Add a **Coupon** model + `POST /wallet/coupons/validate` (code → discount). Optional but
   in the deck.
2. Add service-fee computation to the charge quote: `POST /wallet/charge/quote` returns
   {amount, fee (2.5%), discount, total}. Keep `charge` + `charge/confirm`.
3. Support charging via a **saved payment method** (method_id) — extend beyond PayPal-only
   (card via gateway). If card-charging is deferred, keep PayPal + show cards as "coming".

### Frontend
4. Build a `ChargeBalanceModal`: amount + quick-amount chips, saved-method radios (from
   `/me/payment-methods`), coupon input + apply, live summary (fee 2.5% + discount + total),
   confirm (disabled until valid). Empty state → open add-method modal (`slide-34`).
5. Open from الرصيد (`slide-32`) and employer dashboard «شحن المحفظة» (`slide-28`).

## 5. Acceptance criteria
- Modal shows amount + quick amounts, saved methods (or empty CTA), coupon apply, and a live
  fee/discount/total summary; charge completes and updates the balance.

## Dependencies
Methods: `slide-34`/`slide-35`/`slide-36`. Balance: `slide-32`. Payments app (coupons + fee).
Currency theme T6 (ر.س).
