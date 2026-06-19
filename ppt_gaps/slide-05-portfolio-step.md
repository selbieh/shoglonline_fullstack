# Slide 05 — إضافة معرض الأعمال (portfolio step in wizard)

- **Module:** Freelancer Profile · Wizard step (معرض الأعمال), progress `75%`
- **PPT screen:** «معرض الأعمال — أضف نماذج من أعمالك السابقة».
- **Status:** ⚠️ partial — portfolio exists but is field-poor.

## 1. What the slide proposes
Per portfolio project:
- **عنوان المشروع** (title) — required.
- **نوع المشروع** (project type) — select.
- **رابط المشروع (اختياري)** (project link, optional).
- **مدة التنفيذ** (duration) — number + unit (شهر/يوم).
- **وصف المشروع** (description) — 0/1000 textarea.
- **المهارات المستخدمة** (skills used) — chips.
- **صور المشروع** (images) — drag/drop multi-upload, PNG/JPG, up to **10**, max 10MB.
- **+ إضافة مشروع آخر** (add another project).
- Footer: stepper + "تخطي" (skippable step) + "حفظ واستكمال لاحقاً".

## 2. Current state in the codebase
- `PortfolioItem` (migration 0005): `title`, `description`, `media_type`(image/video/link),
  `url`, `cover_url`, `order`, `attachments` (GenericRelation). CRUD via `POST/GET/DELETE
  /me/portfolio`.
- `me/profile` PortfolioSection supports image/video/link + title + description + single
  cover; **one media item per entry**, not a multi-image project.
- **Missing fields**: project type, project link (distinct from media url), duration,
  skills-used, multi-image gallery per project.

## 3. Gap
The deck models a **project** (title + type + link + duration + skills + many images),
whereas the code models a **single media tile**. Need to enrich `PortfolioItem` into a
project with a gallery and metadata. (This slide ≈ `slide-23` "add portfolio work" full page.)

## 4. Plan
Implement together with `slide-23` (same data model; this is the in-wizard variant).

### Backend
1. Extend `PortfolioItem`: `project_type` (CharField/FK), `project_link` (URLField, blank),
   `duration_value` (PositiveInt), `duration_unit` (choices: day/month), `skills` (M2M to
   `catalog.Skill` **or** JSON list), and support **multiple images** (already via
   `attachments` GenericRelation — allow N). Migration.
2. Update `PortfolioItemSerializer`/views to read/write the new fields + multiple
   `attachment_ids`; enforce ≤10 images, 1000-char description, contact guard (`slide-01`).

### Frontend
3. Build a `PortfolioProjectForm` (shared with `slide-23`): title, type select, optional
   link, duration (number+unit), description w/ 1000 counter, skills chips, multi-image
   dropzone (≤10, ≤10MB each via `/uploads`).
4. Wizard step renders this form with "+ إضافة مشروع آخر" to stack multiple, plus "تخطي"
   (optional step per `slide-10`).

## 5. Acceptance criteria
- A project saves with type/link/duration/skills and up to 10 images; gallery renders on
  the profile (`slide-11/12`) and detail page (`slide-22`).
- Step is skippable and resumable.

## Dependencies
Same model as `slide-23`, `slide-24`, `slide-22`. Skills source: `slide-04`. Stepper:
`slide-10`. **Phase-1 foundation** for the portfolio fields.
