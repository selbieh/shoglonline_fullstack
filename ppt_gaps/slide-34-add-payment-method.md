# Slide 34 — إضافة وسيلة الدفع (أثناء الشحن) (add payment method modal)

- **Module:** Account Settings · payment methods · add modal
- **PPT screen:** «إضافة وسيلة دفع» (two tabs).
- **Status:** ⚠️ partial — PayPal add exists; card add missing.

## 1. What the slide proposes
A modal with two tabs:
- **إضافة بطاقة ائتمانية** (credit card): اسم حامل البطاقة, رقم البطاقة (Visa/MC), تاريخ
  الانتهاء (MM/YY), CVV, اسم مستعار للبطاقة (optional), **تعيين كوسيلة دفع افتراضية** checkbox.
  Note «بياناتك مشفرة وآمنة … لن يتم حفظ أي عملية قبل التحقق».
- **إضافة حساب PayPal**: البريد الإلكتروني لحساب PayPal, اسم مستعار, set default. «ربط حساب PayPal».
- Buttons: **حفظ البطاقة** / **ربط حساب PayPal** / **إلغاء**.

## 2. Current state in the codebase
- `components/PaymentMethods.tsx`: add **PayPal** only (email + label → POST
  `/me/payment-methods` with a stub vault token). **No card tab.**
- Backend `PaymentMethod` supports type ∈ {paypal, card} and stores tokenized data
  (brand/last4/gateway_token) — PCI SAQ-A. But there's **no card-tokenization integration**
  (no Stripe.js / gateway hosted fields).

## 3. Gap
The card tab and its tokenization flow are missing. Raw PANs must **never** touch our
backend — card capture must use a gateway tokenizer (Stripe Elements / PayPal hosted
fields) that returns a token we save.

## 4. Plan

### Backend
1. Confirm `POST /me/payment-methods` accepts a `{type:"card", gateway_token, brand, last4,
   label, is_default}` payload (model already supports it). Add the gateway integration to
   exchange a client token for a stored vault token (server side), if the chosen gateway
   needs it.
2. Decide the card gateway (Stripe vs PayPal cards). Document in payments app.

### Frontend
3. Build the `AddPaymentMethodModal` with two tabs:
   - **Card**: gateway hosted fields (Stripe Elements / PayPal) — never plain inputs for PAN
     in our state; collect label + set-default; on tokenize, POST the token.
   - **PayPal**: existing email/label flow.
4. Reuse the modal from the charge flow (`slide-33`) and the manage-methods screen
   (`slide-35`/`slide-36`).

## 5. Acceptance criteria
- A user can add a card via gateway tokenization (no PAN stored by us) and a PayPal account;
  both appear in the saved-methods list with optional default.

## Dependencies
Manage list: `slide-35`/`slide-36`. Used by charge `slide-33`. Payments app + a card gateway.
PCI: tokenize client-side only.
