# Slide 42 — استلام الأرباح (Instapay) (payout: Instapay, Egypt)

- **Module:** Account Settings · استلام الأرباح · Instapay modal
- **PPT screen:** «إضافة حساب Instapay لاستلام الأرباح».
- **Status:** ❌ missing

## 1. What the slide proposes
Modal (مصر فقط): **الدولة** (مصر, locked), **رابط الدفع الخاص بإنستا أو رقم الهاتف المرتبط
بحساب Instapay** (required), **الاسم الذي يظهر عند التحويل** (required — must match Instapay),
**اسم مستعار (اختياري)**, **تعيين كوسيلة استلام افتراضية**. «بيانات الحساب محفوظة بأمان».

## 2. Current state in the codebase
- None.

## 3. Gap
Entire Instapay payout rail missing; needs Egypt gating + link/phone + display-name field.

## 4. Plan

### Backend
1. `PayoutMethod` kind=`instapay`, details `{instapay_link_or_phone, display_name}`,
   `country=EG` enforced. Validate that at least the link/phone + display name are present.

### Frontend
2. `AddInstapayPayoutModal`: country locked, link-or-phone input, display-name input (with
   the "must match Instapay" note), nickname, set-default; opens from the payouts hub
   (`slide-38`). EG-only gating like `slide-41`.

## 5. Acceptance criteria
- An EG user can save an Instapay payout method (link/phone + display name); region-gated.

## Dependencies
Parent: `slide-38`. Region gating shared with `slide-41`. Shares `PayoutMethod` model.
