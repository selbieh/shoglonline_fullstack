# Slide 03 — تعديل صفحة العمل والمهارات (work & skills step)

- **Module:** Freelancer Profile · Wizard step 2 (العمل والمهارات)
- **PPT screen:** «تهيئة الحساب → العمل والمهارات», progress `25%`.
- **Status:** ⚠️ partial

## 1. What the slide proposes
- **المسمى الوظيفي** (job title) — free text, e.g. "مصمم واجهات مستخدم".
- **المجال الرئيسي** (main field/category) — select, e.g. "التصميم والإبداع".
- **التخصص الدقيق** (specialization/subcategory) — select, e.g. "تصميم واجهات وتجربة المستخدم".
- **سنوات الخبرة** (years of experience) — select.
- **المهارات** (skills) — chips with proficiency, add up to 3–15, "avoid duplicates".
- **مهارات مقترحة بناءً على المسمى الوظيفي** (suggested skills based on job title) — quick-add chips.
- Footer: stepper + "حفظ واستكمال لاحقاً".

## 2. Current state in the codebase
- `WorkerProfile.bio_title` doubles as the job title; `expertise_level`
  (entry/intermediate/expert) exists but **years of experience** is not a field.
- **No `main_field` / `specialization`** on the profile. Categories exist in `apps/catalog`
  (used by jobs/services) but the worker profile is not linked to a category/subcategory.
- Skills: `WorkerSkill` (FK to `catalog.Skill`) with `efficiency` ∈ {beginner, intermediate,
  advanced} — see `slide-04` (deck wants a 4th level "خبير").
- `me/profile` already renders skills + add-skill dropdown from `/skills`. No "suggested
  skills by job title" feature.

## 3. Gap
Missing: a dedicated job-title field separate from bio, a main-field + specialization
(category/subcategory) link, a normalized years-of-experience field, and skill suggestions
driven by the chosen job title/field.

## 4. Plan

### Backend
1. Add to `WorkerProfile`: `job_title` (or formally reuse `bio_title`), `main_category`
   (FK→`catalog.Category`), `specialization` (FK→`catalog.Subcategory`), `years_experience`
   (small int or choices band). Migration.
2. Expose them in `WorkerProfileSerializer` (read/write).
3. Add `GET /api/v1/catalog/categories` (+ subcategories) if not already public, to feed the
   selects.
4. Optional: `GET /api/v1/skills/suggested?category=<id>` returning top skills for a
   category to power the "مهارات مقترحة" chips (can start as a static map per category).

### Frontend
5. Wizard step 2 form: job title input, main-field select, specialization select (dependent
   on field), years-of-experience select, skills multi-add (reusing the `slide-04` skill
   picker), and a "suggested skills" chip row that quick-adds.
6. Validate min 3 skills before "التالي" (matches the deck hint).

## 5. Acceptance criteria
- Step 2 persists job title, main field, specialization, years, and ≥3 skills.
- Selecting a job title/field populates suggested-skill chips that add on click.

## Dependencies
Skill levels: `slide-04`. Category source: `apps/catalog`. Stepper: `slide-10`.
