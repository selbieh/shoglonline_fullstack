# Slide 08 — التحقق من الحساب (account verification)

- **Module:** Freelancer Profile · Wizard step (التحقق), progress `85%` (optional/skippable)
- **PPT screen:** «التحقق من الحساب — أكمل خطوات التحقق لزيادة ثقة العملاء».
- **Status:** ⚠️ partial — ID upload exists; email/phone/selfie/front-back/state UI missing.

## 1. What the slide proposes
- **البريد الإلكتروني** — shows verified state «تم التحقق ✓».
- **رقم الجوال** — country code (+966) + number + «إرسال رمز التحقق» + 4-digit OTP boxes +
  «إعادة الإرسال».
- **الهوية الشخصية** — doc type select (بطاقة هوية / جواز), **الوجه الأمامي** + **الوجه الخلفي**
  upload (JPG/PNG/PDF ≤5MB each).
- **صورة شخصية للتحقق** (selfie) — upload (JPG/PNG ≤5MB).
- **حالة التحقق** — three chips: البريد (تم) / الجوال (قيد التحقق) / الهوية (لم يتم بعد).
- Consent checkbox «أؤكد أن البيانات والمستندات المرفوعة تخصني».

## 2. Current state in the codebase
- `IDVerification` model (OneToOne→User): `status` (pending/approved/rejected),
  `attachments` (generic), `reject_reason`, reviewer fields. API `GET/POST /me/id-verification`.
- `me/profile` has a minimal ID section: status label + single file upload. **No** doc-type
  select, **no** explicit front/back, **no** selfie, **no** consent checkbox.
- `User.phone` + `User.phone_verified` exist but **no OTP endpoints / SMS integration**.
- Email is verified implicitly via Google SSO (`email_verified`); no per-user verified flag
  surfaced as a chip.

## 3. Gap
Phone OTP flow is entirely missing; ID capture lacks doc-type + front/back + selfie +
consent; there's no consolidated 3-channel verification status UI; not presented as a wizard
step.

## 4. Plan

### Backend
1. **Phone OTP**: add `POST /auth/phone/request-otp` (rate-limited, stores hashed code +
   expiry) and `POST /auth/phone/verify-otp` (sets `User.phone_verified=True`). Pluggable SMS
   sender (stub in dev, provider in prod).
2. **ID verification**: extend `IDVerification` to distinguish `id_front`, `id_back`,
   `selfie` (either typed attachment roles or separate FKs), `doc_type`
   (national_id/passport), and `consent_accepted`. Update serializer/view to accept these.
3. Add an email-verified signal to `MeSerializer` (e.g. `email_verified` boolean) for the chip.

### Frontend
4. Build the verification step/screen: email row (verified chip), phone row (country code +
   number + send-OTP + 4 OTP boxes + resend timer), ID block (doc-type select + front/back
   dropzones), selfie dropzone, 3-channel status chips, consent checkbox gating submit.
5. Reuse it both as wizard step (`slide-10`, optional) and inside settings/profile later.

## 5. Acceptance criteria
- A user can request + enter an OTP and see phone become verified.
- ID submission captures doc type, front, back, selfie, and consent; status chips reflect
  email/phone/ID independently.

## Dependencies
Phone OTP also used by employer verify (`slide-27`) and settings. Attachments pipeline.
Stepper: `slide-10`. **Phase-1/2** (OTP backend is foundational).
