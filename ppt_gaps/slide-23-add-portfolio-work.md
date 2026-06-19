# Slide 23 — إضافة معرض عمل (add portfolio work — full page)

- **Module:** Freelancer Profile · standalone add-portfolio page
- **PPT screen:** «مقترح شاشة إضافة عمل جديد».
- **Status:** ⚠️ partial (same model as `slide-05`; here as a full page + files + terms)

## 1. What the slide proposes
- **عنوان العمل** (title) — required.
- **صورة مصغرة للعمل** (cover) — required, 16:9, ≤5MB.
- **وصف العمل** (description) — 0/1000.
- **صور العمل** (images) — up to 10, JPG/PNG ≤5MB each.
- **ملفات العمل (اختياري)** (files) — PDF/ZIP/DOC ≤20MB.
- **رابط العمل (اختياري)** (link).
- **تاريخ الإنجاز** (completion date) + **المهارات المستخدمة** (skills).
- **تأكيد الشروط** checkbox «أؤكد أن العمل ينفّذه بنفسي ولدي الصلاحية الكاملة لنشره».
- Sidebar: «نصائح لإضافة عمل مميز» + «شروط نشر الأعمال» + «الملفات المدعومة».
- Buttons: **+ إضافة العمل** / **إلغاء**.

## 2. Current state in the codebase
- Portfolio CRUD via `POST/GET/DELETE /me/portfolio`; UI inside `me/profile` PortfolioSection
  (single media tile + title + description + cover). **No** cover-required flow, multi-image,
  files attachment, completion date, skills, or terms checkbox; **no edit**, only add/delete.

## 3. Gap
Same field gaps as `slide-05` plus: a **cover image** as a first-class required field, **work
files** (PDF/ZIP/DOC up to 20MB), a **terms/ownership** checkbox, tips/rules sidebar, and a
dedicated route (not just inside profile edit).

## 4. Plan
Implement the data model once (shared with `slide-05`), expose a full page here.

### Backend
1. On `PortfolioItem` (from `slide-05`): ensure `cover` (required), `images` (≤10),
   `files` (attachments, PDF/ZIP/DOC ≤20MB), `project_link`, `completed_at`, `skills`,
   `ownership_confirmed` (bool). Validate sizes/types; contact guard on description.
2. Support **edit**: `PATCH /me/portfolio/<id>` (today only POST/DELETE).

### Frontend
3. New route `frontend/app/me/portfolio/new/page.tsx` (and `/[id]/edit`) with the full form,
   cover dropzone (16:9), multi-image dropzone, files dropzone, link, completion date,
   skills picker (`slide-04`), terms checkbox gating submit, and the tips/rules sidebar.
4. Reuse the same `PortfolioProjectForm` as the wizard step (`slide-05`).
5. Link "+ إضافة عمل" from profile/portfolio management here; saved items open `slide-22`.

## 5. Acceptance criteria
- A work can be added/edited with required cover, ≤10 images, optional files/link, completion
  date, skills, and confirmed ownership; renders on profile + detail page.

## Dependencies
Shared model/form with `slide-05`; detail page `slide-22`; manage view `slide-24`;
skills `slide-04`; attachments pipeline; contact guard `slide-01`.
