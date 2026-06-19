# ppt_gaps — Gap analysis of `Presentation1.pptx.pdf` vs. the current build

This folder contains **one planning file per slide** (43 slides) from the client's
presentation. Each file:

1. Describes **what the slide proposes** (the target design / requirement).
2. Records the **current state** in the codebase (frontend + backend, with file refs).
3. Names the **gap**.
4. Gives a **step‑by‑step plan** to close it, split into Backend / Frontend work.
5. Lists **acceptance criteria** and **dependencies** on other slides.

> Source of truth for the target = the PPT slides. Source of truth for "what exists" =
> the live code under `frontend/` and `backend/`. The older `design/screens/*.html`
> mockups are reference only; where the PPT and the HTML disagree, the **PPT wins**.

## File naming

`slide-NN-<short-kebab-title>.md` — `NN` is the 1‑based slide number (zero‑padded).

## The three modules in the deck

| Slides | Module |
|--------|--------|
| 01–24  | **Freelancer Profile Module** (profile creation wizard + profile views + freelancer dashboards: tasks, proposals, services, portfolio) |
| 25–29  | **Client / Employer Profile Module** (create profile, verify, dashboard) |
| 30–43  | **Account Settings** (unified for freelancer + employer: account info, balance, charge, payment methods, receipt, payout/earnings, favorites) |

## Slide → feature → status map

Legend: ✅ exists · ⚠️ partial · ❌ missing · 🚫 explicitly out of scope (per the deck)

| # | Slide (AR) | Feature | Status | Primary code |
|---|------------|---------|--------|--------------|
| 01 | Create Freelancer Profile Module (intro + "no external contact" rule) | cross‑cutting rule | ⚠️ | `freelancers/[id]`, `profiles` serializers |
| 02 | البيانات الشخصية (personal data step) | onboarding step 1 | ❌ | `app/onboarding/profile` |
| 03 | تعديل العمل والمهارات | job title / field / specialization / years | ⚠️ | `me/profile`, `profiles.models` |
| 04 | إضافة المهارة + مستوى المهارة | skill + 4 levels | ⚠️ | `me/profile`, `WorkerSkill` (3 levels) |
| 05 | إضافة معرض الأعمال (step) | portfolio: type/link/duration/skills/imgs | ⚠️ | `PortfolioItem`, `me/profile` |
| 06 | إضافة الشهادات التدريبية | certifications | ❌ | (no model) |
| 07 | التسعير والتوفر للعمل | rate USD / availability / weekly hours | ⚠️ | `WorkerProfile` |
| 08 | التحقق من الحساب (verify) | email/phone OTP/ID front+back/selfie | ⚠️ | `IDVerification`, phone OTP missing |
| 09 | المراجعة والنشر | review + publish profile | ❌ | — |
| 10 | مراحل شريط التقديم (stepper) | wizard stepper spec | ❌ | — |
| 11 | شاشة البروفايل (رؤية النفس) | freelancer self profile | ⚠️ | `me/profile`, `freelancers/[id]` |
| 12 | شاشة البروفايل (رؤية الآخرين) | public profile + hire/message | ⚠️ | `freelancers/[id]` |
| 13 | مهام المستقل | my tasks + status tabs w/ counts | ⚠️ | `app/contracts` |
| 14 | مهام المستقل (قائمة منسدلة) | per‑task action menu | ⚠️ | `app/contracts` |
| 15 | عروض المستقل | my proposals + status tabs w/ counts | ⚠️ | `me/proposals` |
| 16 | عروض المستقل (قائمة منسدلة) | per‑proposal action menu | ⚠️ | `me/proposals` |
| 17 | خدمات المستقل (رؤية النفس) | my services + status tabs | ⚠️ | `me/services` |
| 18 | خدمات المستقل (رؤية الغير) | public freelancer services grid | ⚠️ | `freelancers/[id]`, `services` |
| 19 | إضافة الخدمة | multi‑step gig create | ⚠️ | `me/services`, `gigs` |
| 20 | الخدمة برؤية المستقل | gig owner view + analytics | ⚠️ | `services/[slug]`, `gigs` |
| 21 | الخدمة برؤية المشتري | gig buyer view | ⚠️ | `services/[slug]` |
| 22 | معرض عمل فردي (رؤية الغير) | portfolio item detail page | ❌ | — |
| 23 | إضافة معرض عمل | full add‑portfolio page | ⚠️ | `PortfolioItem`, `me/profile` |
| 24 | إضافة معرض عمل (بعد الملء) | portfolio item manage/edit view | ❌ | — |
| 25 | Client Profile Module (intro) | cross‑cutting rule | — | — |
| 26 | إنشاء بروفايل صاحب العمل | employer profile create | ❌ | `EmployerProfile` (no API) |
| 27 | إنشاء بروفايل صاحب العمل (تحقق) | employer verify step | ❌ | — |
| 28 | لوحة تحكم صاحب العمل (رؤية النفس) | employer dashboard | ⚠️ | `app/dashboard` |
| 29 | لوحة تحكم صاحب العمل (رؤية الغير) | — | 🚫 | out of scope per deck |
| 30 | إعدادات الحساب (intro) | unified settings shell | ⚠️ | `app/settings` |
| 31 | معلومات الحساب | name/email change/deactivate/delete | ⚠️ | `app/settings`, `accounts` |
| 32 | الرصيد | wallet: 4 balance cards + statement filters | ⚠️ | `app/wallet`, `payments` |
| 33 | شحن الرصيد | charge modal: amounts/coupon/fee/methods | ⚠️ | `app/wallet` |
| 34 | إضافة وسيلة دفع (أثناء الشحن) | add card / PayPal modal | ⚠️ | `PaymentMethods` |
| 35 | إدارة وسائل الدفع (خالية) | empty methods screen | ⚠️ | `PaymentMethods` |
| 36 | إدارة وسائل الدفع (ممتلئة) | methods list + default/edit/delete | ⚠️ | `PaymentMethods` |
| 37 | إيصال معاملة الدفع | receipt modal + PDF/print | ❌ | — |
| 38 | استلام الأرباح | payout methods hub (5 types) | ❌ | `WithdrawalRequest` (PayPal only) |
| 39 | استلام الأرباح (PayPal) | payout: PayPal modal | ⚠️ | `app/wallet` |
| 40 | استلام الأرباح (تحويل بنكي) | payout: bank/IBAN modal | ❌ | — |
| 41 | استلام الأرباح (محفظة) | payout: e‑wallet modal | ❌ | — |
| 42 | استلام الأرباح (انستا) | payout: Instapay modal | ❌ | — |
| 43 | المفضلة | favorites w/ 5 tabs | ⚠️ | `me/favorites` (services only) |

## Cross‑cutting themes (recur across many slides)

- **T1 — No external contact on profiles** (slides 01, 25): profile pages and public
  views must not expose WhatsApp/phone/email/social links. Mostly already true; audit
  needed. See `slide-01`.
- **T2 — Multi‑step wizard + stepper** (slides 02–10): the freelancer onboarding is a
  9‑step RTL wizard with mandatory/optional steps, completion %, and "save & resume".
  Today it is a 3‑step wizard. See `slide-10` for the canonical stepper spec.
- **T3 — Skill levels = 4** (slide 04): deck wants مبتدئ/متوسط/متقدم/خبير. Backend
  `WorkerSkill.efficiency` has only 3. Single migration fixes many slides.
- **T4 — Status‑filter tab bars with counts** (slides 13,15,17): tasks/proposals/services
  lists need tab bars with per‑status counts. Backend filters exist; counts + UI missing.
- **T5 — Saved payment & payout methods** (slides 33–42): card add (Stripe‑style),
  multi‑rail payouts (PayPal/bank/e‑wallet/Instapay/card), receipts. Backend is
  PayPal‑only today.
- **T6 — Currency**: deck mixes USD (rate) and SAR/ر.س (wallet). Confirm display currency
  per surface; backend has no currency field. Flagged where relevant.

## Recommended execution order

Plans are grouped so we ship coherent slices, backend‑first where data is missing.

0. **Phase 0 — Design system & brand alignment** (`slide-00`): re‑tokenize to the
   `Sho8l online (Copy).pdf` palette, wire the `export/` assets (logo, character
   illustration, rating chips), tame the rainbow palette, and restyle shared components +
   key pages. **Visual authority = the PDF; functional authority = these slides (functional
   wins on conflict).** Every slide below inherits this. Do it first / alongside Phase 1.
1. **Phase 1 — Data model foundations** (unblocks the most UI):
   `slide-04` (4th skill level), `slide-06` (certifications model), `slide-07`
   (availability/weekly‑hours/video fields), `slide-03` (field/specialization/years),
   `slide-05`+`slide-23` (portfolio fields: link/duration/skills/files), `slide-38`
   (payout method model + rails).
2. **Phase 2 — Freelancer onboarding wizard** (slides 02, 08, 09, 10) on top of Phase 1.
3. **Phase 3 — Profile views** (slides 11, 12) + **portfolio detail/add** (22, 23, 24).
4. **Phase 4 — Freelancer dashboards**: tasks (13,14), proposals (15,16), services
   (17,18,19,20,21).
5. **Phase 5 — Client module** (26, 27, 28).
6. **Phase 6 — Account settings & money** (30,31,32,33,34,35,36,37,39,40,41,42,43).

Each slide file is self‑contained; this order just minimises rework.
