# Slide 37 — إيصال معاملة الدفع (payment transaction receipt)

- **Module:** Account Settings · الرصيد · receipt modal
- **PPT screen:** «إيصال معاملة دفع».
- **Status:** ❌ missing

## 1. What the slide proposes
A receipt modal (branded «شغل أونلاين»):
- «معاملة صادرة/واردة», «تم تنفيذ عملية الدفع بنجاح».
- التاريخ, رقم العملية (TRX-…), حالة المعاملة (مكتملة), الوقت.
- المبلغ (1,500 ر.س), الرسوم (15 ر.س), **صافي العملية** (المبلغ المحوّل) (1,485 ر.س).
- وسيلة الدفع (المحفظة الداخلية), اسم الجهة/المستفيد, وصف العملية, رقم الإيصال/المرجع (RCP-…).
- Actions: **تحميل PDF** / **طباعة** / **إغلاق**.

## 2. Current state in the codebase
- Transactions exist (`Transaction` ledger) and `app/wallet` shows a table, but there is
  **no receipt view/modal**, no per-transaction reference/receipt number, and no PDF.
- The `invoices` app generates contract invoices (`pdf_url`) — a possible PDF pattern to
  reuse, but not wired to wallet transactions.

## 3. Gap
No transaction receipt UI, no receipt/reference numbers on transactions, and no PDF/print
for a wallet transaction.

## 4. Plan

### Backend
1. Add to `Transaction`: a stable `reference` (e.g. `TRX-YYYY-MM-NNNNNN`) and `receipt_ref`
   (`RCP-…`), plus a human `description`, fee, net, counterparty. Backfill via migration data
   or compute on read.
2. `GET /me/transactions/<id>/receipt` returning the receipt payload; optional
   `…/receipt.pdf` (reuse the invoices PDF approach) for **تحميل PDF**.

### Frontend
3. Build a `ReceiptModal` opened from the statement «عرض» link (`slide-32`): all fields per
   the slide, branded header, **تحميل PDF** (hit the pdf endpoint), **طباعة** (`window.print`
   with a print stylesheet), **إغلاق**.

## 5. Acceptance criteria
- Clicking «عرض» on a transaction opens a receipt with reference numbers, amount/fees/net,
  method, and counterparty; PDF download and print work.

## Dependencies
Statement: `slide-32`. PDF pattern from `invoices` app. Shell `slide-30`.
