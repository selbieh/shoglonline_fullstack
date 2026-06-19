# Slide 27 — إنشاء بروفايل صاحب العمل: التحقق (employer verify step)

- **Module:** Client / Employer Profile · create (step 2 of 2)
- **PPT screen:** «تحقق من حسابك» (within employer create).
- **Status:** ❌ missing (reuses the same verification primitives as `slide-08`)

## 1. What the slide proposes
- **البريد الإلكتروني** — verified chip.
- **رقم الجوال** — country code (+966) + number + «إرسال رمز التحقق» + OTP boxes.
- **الهوية الشخصية** — doc type + front/back upload.
- Consent checkbox «أؤكد أن البيانات والمستندات المرفوعة تخصني».
- **فوائد التحقق** sidebar (trust, easier payments, better protection) + «بياناتك محفوظة وآمنة».
- Buttons: **إكمال** / **تخطي** / **إلغاء** — note «يمكنك تخطي هذه الخطوة الآن وإكمالها لاحقًا من الإعدادات».

## 2. Current state in the codebase
- Same as `slide-08`: `IDVerification` exists (ID upload), **phone OTP not implemented**,
  email verified via SSO. No employer-specific verification UI.

## 3. Gap
No employer verification step; depends on the shared OTP + ID-verification work from
`slide-08`. Note: employer ID here mirrors personal ID; commercial-registration docs are a
possible extension (the dashboard `slide-28` shows «وثائق الشركة»).

## 4. Plan

### Backend
1. Reuse the phone-OTP endpoints and `IDVerification` enhancements from `slide-08` (shared,
   not employer-specific). Optionally allow a `company_docs` attachment role for «وثائق الشركة».

### Frontend
2. Build the employer verify step (step 2 of the `slide-26` wizard) reusing the verification
   component from `slide-08`: email chip, phone OTP, ID front/back, consent.
3. Honour **تخطي**: verification is optional at creation; surface it later in settings
   (`slide-31` security/verification) and reflect status on the dashboard (`slide-28`).

## 5. Acceptance criteria
- Employer can verify phone + ID (or skip) during creation; status reflects in dashboard
  and settings.

## Dependencies
Reuses `slide-08` (OTP + ID). Part of `slide-26` wizard. Dashboard status: `slide-28`.
