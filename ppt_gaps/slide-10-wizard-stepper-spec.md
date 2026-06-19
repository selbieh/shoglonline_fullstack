# Slide 10 — مراحل شريط التقديم (wizard stepper spec)

- **Module:** Freelancer Profile · the stepper component used by slides 02–09
- **PPT screen:** Legend + step diagram. **This is the canonical spec for the wizard.**
- **Status:** ❌ missing (current onboarding is 3 linear steps, LTR-ish, no states)

## 1. What the slide proposes
A horizontal stepper with explicit states and direction:
- **States:** مكتمل (completed — green check) · الحالي (current — blue filled) ·
  «اختياري ويمكن تخطيه» (optional — dashed ring) · إلزامي (mandatory — solid ring).
- **Direction:** «اتجاه التقدم: من اليمين إلى اليسار» (progress flows **right → left**, RTL).
- **Steps & requiredness:**
  1. البيانات الشخصية — إلزامي (`slide-02`)
  2. العمل والمهارات — إلزامي (`slide-03`/`04`)
  3. الخبرات — اختياري (experience/education/`slide-06` certs)
  5. الخدمات — إلزامي (create at least one gig, `slide-17`/`19`)
  6. تفاصيل العمل — إلزامي (`slide-07`)
  7. معرض الأعمال — اختياري (`slide-05`/`23`)
  8. التحقق — اختياري (`slide-08`)
  9. المراجعة والنشر — إلزامي (`slide-09`)

> Note: the deck's numbering skips 4 in this diagram; treat the **order + requiredness**
> above as authoritative and use a contiguous internal index. Mandatory steps cannot be
> skipped; optional steps show "تخطي".

## 2. Current state in the codebase
- `frontend/app/onboarding/profile/page.tsx`: 3 steps, a simple % bar + "خطوة X من 3",
  Back/Skip/Next. No per-step state styling, no RTL right→left ordering, no mandatory vs
  optional distinction, no deep-linkable step index, no resume.

## 3. Gap
No reusable stepper component, no step model with requiredness/skippability/completion
state, no RTL ordering, no save-and-resume, no deep-link to a step (needed by `slide-09`
edit links).

## 4. Plan

### Frontend (mostly)
1. Build a reusable `<WizardStepper steps activeIndex onJump />` component:
   - Renders RTL (step 1 on the right), connector line, per-step ring style by state
     (completed/current/mandatory/optional), Arabic labels, and the legend.
   - `onJump` allowed only to completed/visited steps (used by `slide-09`).
2. Build a `WizardShell` that owns step config (id, label, required, component), current
   index, completion map, and persistence:
   - Persist progress to backend (reuse `WorkerProfile` fields + a lightweight
     `onboarding_step`/`completed_steps` marker) so "حفظ واستكمال لاحقاً" resumes.
   - Mandatory steps block "التالي" until valid; optional steps show "تخطي".
3. Refactor slides 02–09 to mount inside this shell as steps in the exact order above.
4. URL: `/onboarding/profile?step=<id>` for deep links from the review screen.

### Backend
5. Add minimal persistence: `WorkerProfile.onboarding_completed_steps` (JSON) or a small
   `OnboardingProgress` record; expose via `/me/profile`. Used for resume + the publish gate
   (`slide-09`).

## 5. Acceptance criteria
- Stepper renders RTL with correct states; mandatory steps can't be skipped, optional can.
- Closing and reopening the wizard resumes at the right step with data intact.
- Review screen edit-links jump to the right step.

## Dependencies
**Foundational for the whole wizard** — build alongside `slide-02`. Consumed by 02–09.
