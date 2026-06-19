# Slide 32 — الرصيد (balance / wallet)

- **Module:** Account Settings · الرصيد
- **PPT screen:** «الإعدادات → الرصيد».
- **Status:** ⚠️ partial

## 1. What the slide proposes
- **4 balance cards:** الرصيد الكلي 8,710.50 · الرصيد المعلق 1,850.00 · الرصيد المتاح
  4,320.50 · الرصيد القابل للسحب 2,540.00 (ر.س).
- **شحن الرصيد** (charge → `slide-33`) + **سحب الرصيد** (withdraw → `slide-38` payouts).
- **كشف الحساب** (statement) with **فلتر**: نوع الحركة (الكل/وارد/صادر), date range (من/إلى),
  quick ranges (آخر 7 أيام / آخر 30 يومًا / هذا الشهر), **تطبيق الفلتر** / **إعادة تعيين**.
- Transactions table: التاريخ, الوصف, النوع, الحالة, المبلغ (+/-), الإجمالي/«عرض» (receipt
  → `slide-37`). Pagination. Note: times in KSA timezone.

## 2. Current state in the codebase
- `frontend/app/wallet/page.tsx`: **3** balance cards (available, escrow_held,
  earnings_pending), inline charge (PayPal) + withdraw (PayPal) forms, and a transactions
  table with **no filters** and no receipt link.
- Backend `Wallet` buckets: available / escrow_held / earnings_pending. `GET /me/transactions`
  supports type/status filters but no date-range. Withdrawable = available (derived).

## 3. Gap
Deck wants **4** cards incl. «الرصيد الكلي» (total) and «القابل للسحب» (withdrawable) as
distinct from «المتاح»; statement filters (type + date range + quick ranges); per-row
receipt link; currency shown as ر.س. Today: 3 cards, no filters, no receipts.

## 4. Plan

### Backend
1. Compute/expose in `GET /me/wallet`: `total` (sum of buckets), `available`, `pending`
   (earnings_pending), `withdrawable` (available minus any holds). Confirm the 4-way mapping
   with product (deck's «المتاح» vs «القابل للسحب» distinction).
2. Add date-range params to `GET /me/transactions` (`from`, `to`, `direction=in|out`) plus
   a human `description` and a `receipt`/`reference` field per row.

### Frontend
3. Settings → الرصيد page: 4 balance cards, شحن/سحب buttons, statement filter bar (type,
   date range, quick ranges, apply/reset), transactions table with direction-coloured
   amounts + «عرض» → receipt modal (`slide-37`), pagination, ر.س formatting + KSA tz note.
4. Wire شحن → `slide-33` modal; سحب → payouts (`slide-38`).

## 5. Acceptance criteria
- 4 balance cards render with correct values; statement filters by type + date range; rows
  expose a receipt; amounts coloured by direction; ر.س + KSA tz shown.

## Dependencies
Charge `slide-33`; payouts `slide-38`; receipt `slide-37`; shell `slide-30`. Payments app.
