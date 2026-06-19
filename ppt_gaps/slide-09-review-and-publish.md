# Slide 09 — المراجعة والنشر (review, preview & publish)

- **Module:** Freelancer Profile · Wizard final step (المراجعة والنشر), progress `90%`
- **PPT screen:** «المراجعة والنشر — راجع تفاصيل ملفك وتأكد من اكتماله قبل نشره».
- **Status:** ❌ missing

## 1. What the slide proposes
- Banner «ملفك جاهز تقريباً للنشر» when required sections complete.
- Summary cards (each with «تعديل» deep-link back to its step): **الخدمات**, **العمل والمهارات**,
  **البيانات الشخصية**, **التحقق**, **معرض الأعمال**, **تفاصيل العمل**.
- Verification card shows email/phone state.
- Confirmation checkbox «أؤكد صحة البيانات المدخلة وجاهزية الملف للنشر».
- Actions: **معاينة** (preview) / **نشر الملف** (publish) / **السابق** / **حفظ واستكمال لاحقاً**.
- Total profile progress bar (e.g. `90%`).

## 2. Current state in the codebase
- No review/publish step. Today the 3-step onboarding just redirects to `/me/profile`.
- `WorkerProfile` has **no published/draft status** — visibility is online/offline only;
  the directory shows profiles based on `visibility=online` + `user.status=active`.
- `completeness_pct` property exists (8 factors) but isn't gated to a publish action.

## 3. Gap
There is no concept of "draft profile → review → publish", no per-section summary with
edit deep-links, no publish gate tied to the ≥70% completeness rule (`slide-02` note), and
no preview.

## 4. Plan

### Backend
1. Add `WorkerProfile.publish_state` (choices: `draft` / `published`) — separate from
   `visibility`. Directory lists only `published` (+ online) profiles.
2. Add `POST /me/profile/publish` that validates completeness ≥70% and required steps
   (personal data, work&skills, services, work details, review) before flipping to
   `published`; returns 400 with the list of missing sections otherwise.
3. Recompute `completeness_pct` to cover the new wizard sections.

### Frontend
4. Build the review step: pull `/me/profile` (+ services, portfolio, certs, verification),
   render one summary card per section with an «تعديل» link that jumps to that wizard step
   (deep-linkable step index).
5. Confirmation checkbox gates «نشر الملف»; «معاينة» opens the public profile in preview
   mode (`slide-12` layout, viewer-as-self). Show the 90%/overall progress bar.
6. On publish: call the endpoint; on success route to the published public profile; on
   validation error, highlight the incomplete cards.

## 5. Acceptance criteria
- Publish is blocked under 70% / missing required sections, with Arabic guidance.
- Each summary card edit-link returns to the correct wizard step with data intact.
- Preview renders the public profile without publishing.

## Dependencies
Completeness rule from `slide-02`; stepper + required/optional flags from `slide-10`;
preview layout from `slide-12`. Sections summarised come from slides 02–08, 17.
