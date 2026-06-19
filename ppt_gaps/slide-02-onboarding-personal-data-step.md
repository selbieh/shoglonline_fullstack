# Slide 02 — البيانات الشخصية (personal-data onboarding step)

- **Module:** Freelancer Profile · Wizard step 1
- **PPT screen:** «تهيئة الحساب → البيانات الشخصية». First step of a 9-step wizard.
- **Status:** ❌ mostly missing (current onboarding is a different, 3-step flow)

## 1. What the slide proposes
Step 1 of the create-profile wizard, fields:
- **الاسم الظاهر للعملاء** (display name shown to clients) — required.
- **الصورة الشخصية** (avatar) — upload, JPG/PNG, recommended; with guidance text.
- **الدولة / المدينة** (country / city) — select.
- **المنطقة الزمنية** (timezone) — select.
- **اللغات** (languages) — multi-select with level (e.g. العربية – لغة أم، الإنجليزية – متوسطة).
- **نبذة قصيرة عنك** (short bio) — textarea, 0/500 counter.
- **فيديو تقديمي (اختياري)** (intro video) — optional upload, MP4/MOV ≤100MB, "can add later".
- Bottom: **9-step progress bar** (`مكتمل 10%`), **السابق / التالي** buttons.

## 2. Current state in the codebase
- `frontend/app/onboarding/mode/page.tsx` — mode selection (find job / find worker). Keep.
- `frontend/app/onboarding/profile/page.tsx` — a **3-step** wizard: (1) expertise level,
  (2) hourly rate, (3) bio_title + overview. Progress = "خطوة X من 3". PATCHes `/me/profile`.
- Backend `WorkerProfile` has `overview`, `bio_title`, `hourly_rate`, `expertise_level`,
  `visibility`. **Missing**: display name field (derived from `user.first_name/last_name`),
  intro `video_url`, timezone, languages-in-wizard (languages exist as `WorkerLanguage` but
  only editable in `me/profile`). `Address` model has `country/city/time_zone` but no API.
- Avatar lives on `User.avatar_url`; no upload step in onboarding.

## 3. Gap
The dedicated "personal data" step does not exist with these fields/order, there is no
display-name concept, no avatar upload in onboarding, no timezone, no languages step, no
intro-video field/storage, and the progress bar is 3 steps not 9.

## 4. Plan

### Backend
1. Add to `WorkerProfile`: `display_name` (CharField, blank — fallback to user names),
   `intro_video` (use attachments pipeline or `video_url` URLField), and expose
   `timezone`/`country`/`city` (either add to `WorkerProfile` or expose `Address` via the
   profile serializer). Migration in `apps/profiles/migrations/`.
2. Extend `WorkerProfileSerializer` to read/write: `display_name`, `country`, `city`,
   `timezone`, `intro_video`, and accept `languages` (already nested, replace-all).
3. Enforce the bio 500-char limit; apply the slide-01 contact guard to bio.
4. Provide a country/city/timezone option source (static JSON or `/api/v1/geo` endpoint).

### Frontend
5. Rebuild `app/onboarding/profile` as the multi-step wizard shell (see `slide-10` for the
   stepper component) and make **step 1** this screen.
6. Build the personal-data form: avatar uploader (reuse `components/FileUpload` + `Avatar`),
   display name, country/city + timezone selects, languages multi-select w/ level, bio with
   live `n/500` counter, optional intro-video uploader (MP4/MOV ≤100MB).
7. Wire "التالي" → PATCH `/me/profile` (+ `/uploads` for media) and advance; "السابق" disabled
   on step 1; persist draft so "save & resume" works (see `slide-09`/`slide-10`).
8. Show real completion % from `completeness_pct`.

## 5. Acceptance criteria
- Step 1 collects all listed fields, persists to backend, shows live bio counter, supports
  optional video, and renders the 9-step stepper with the correct % at step 1.
- Reloading mid-wizard restores entered data (resume).

## Dependencies
Stepper spec: `slide-10`. Contact guard: `slide-01`. Languages also in `me/profile`
(`slide-11`). Avatar field reused by `slide-26` (employer).
