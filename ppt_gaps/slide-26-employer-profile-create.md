# Slide 26 — إنشاء بروفايل صاحب العمل (create employer profile)

- **Module:** Client / Employer Profile · create (step 1 of 2)
- **PPT screen:** «أنشئ ملفك كصاحب عمل».
- **Status:** ❌ missing (no employer create flow / API)

## 1. What the slide proposes
A 2-step stepper (1: البيانات الأساسية, 2: التحقق من الحساب). Step 1 fields:
- **الاسم** (company / entity name) — required.
- **المجال** (field/industry) — select.
- **الدولة / المدينة** — select.
- **المنطقة الزمنية** — select.
- **الصورة الشخصية** (logo) — upload (optional, company logo recommended).
- Buttons: **التالي** / **إلغاء**. Note: «يمكنك تعديل هذه المعلومات لاحقًا من الإعدادات».

## 2. Current state in the codebase
- `EmployerProfile` (company_name, rating, total_spent) — **no field/industry, no logo, no
  country/city/timezone, no API, no serializer, no UI**.
- Onboarding `mode` page sets `active_mode=find_worker` but there is no employer profile
  creation afterwards (freelancer path has `onboarding/profile`).

## 3. Gap
No employer profile create screen, no backend write API, and the model lacks
field/logo/location/timezone.

## 4. Plan

### Backend
1. Extend `EmployerProfile`: `field`/`industry` (CharField/FK), `country`, `city`,
   `timezone`, `logo` (URL or attachment; or reuse `User.avatar_url`). Migration.
2. Add `GET/PATCH /me/employer-profile` (lazy-create like worker profile) + serializer.
   Apply contact guard to any description fields.

### Frontend
3. Add `frontend/app/onboarding/employer/page.tsx` (or reuse the wizard shell from `slide-10`
   with 2 steps). Step 1 form: name, field select, country/city, timezone, logo upload.
4. Route `find_worker` users without a completed employer profile into this flow after the
   mode screen. Step 2 = `slide-27`.

## 5. Acceptance criteria
- An employer can create their profile (name/field/location/timezone/logo), persisted via
  the new API, then continue to verification.

## Dependencies
Stepper: `slide-10` (2-step variant). Verify step: `slide-27`. Dashboard: `slide-28`.
Geo/timezone source shared with `slide-02`.
