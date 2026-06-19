# Slide 07 — تفاصيل العمل: التسعير والتوفر (pricing & availability)

- **Module:** Freelancer Profile · Wizard step (تفاصيل العمل), progress `40%`
- **PPT screen:** «تفاصيل العمل — أضف معلومات التسعير والتوفر».
- **Status:** ⚠️ partial

## 1. What the slide proposes
- **سعر الساعة (بالدولار)** (hourly rate, USD) — number with `USD` suffix.
- **التوفر للعمل** (availability) — 3 cards: **متاح الآن** (now) / **متاح قريباً** (soon) /
  **غير متاح حالياً** (unavailable).
- **عدد ساعات العمل أسبوعياً** (weekly work hours) — select.
- **ملاحظات للعملاء (اختياري)** (client notes) — 0/300 textarea.

## 2. Current state in the codebase
- `WorkerProfile.hourly_rate` exists (Decimal). UI in onboarding step + `me/profile`.
- `WorkerProfile.visibility` is **online/offline** only (a 2-state visibility toggle in
  `settings`), not the 3-state availability (now/soon/unavailable) the deck wants.
- **Missing**: weekly-hours field, client-notes field, the 3-state availability, and a
  USD-explicit label (today rate is shown in KWD/SAR depending on surface — see currency
  theme T6).

## 3. Gap
Availability is 2-state not 3-state; weekly hours and client notes don't exist; rate is
not labelled/stored as USD consistently.

## 4. Plan

### Backend
1. Add to `WorkerProfile`: `availability` (choices: `available_now` / `available_soon` /
   `unavailable`), `weekly_hours` (small int or band choices), `client_notes` (CharField 300,
   blank). Migration. Keep `visibility` (online/offline) as a separate concept or map
   `unavailable`→offline for directory filtering.
2. Expose all three in `WorkerProfileSerializer`; apply contact guard to `client_notes`.
3. Decide currency: confirm hourly rate currency (deck says USD). If platform wallet is SAR,
   either store rate currency on the field or render a converted/explicit "USD" label only
   here. Flag for product (T6).

### Frontend
4. Wizard "تفاصيل العمل" step: rate input with USD suffix, 3 availability cards (single
   select), weekly-hours select, client-notes textarea w/ 300 counter.
5. Reflect availability on public profile as the status pill «● متاح للعمل» (`slide-11/12`)
   and in the directory filter (`freelancers` list).

## 5. Acceptance criteria
- Rate, 3-state availability, weekly hours, and notes persist and render on profile.
- Availability pill appears on public profile and is filterable in the directory.

## Dependencies
Public profile: `slide-11`, `slide-12`. Directory: `freelancers/page.tsx`. Currency theme
T6. **Phase-1 foundation** (new fields).
