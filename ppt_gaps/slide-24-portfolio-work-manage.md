# Slide 24 — إضافة معرض عمل بعد ملئ الحقول (portfolio work manage/edit)

- **Module:** Freelancer Profile · portfolio item manage view (owner)
- **PPT screen:** «مقترح شاشة إضافة معرض عمل بعد ملئ الحقول».
- **Status:** ❌ missing (no per-item manage/edit/stats view)

## 1. What the slide proposes
The owner's manage view of an already-saved work, with tabs:
- **البيانات الأساسية** (basic data — editable cover/title/description/images/link/skills/
  completion date, with «حالة العمل: منشور»).
- **التسعير والملفات** (pricing & files — work files).
- **إحصائيات العمل** (stats — مشاهدات 1,245 · إعجابات 256 · حفظ في المفضلة 89 · مشاركات 42).
- Right rail: «نبذة عن العمل» summary + **إجراءات سريعة** (معاينة العمل / نسخ رابط العمل /
  حذف العمل) + «نصائح لعرض أفضل». Header actions: «عرض العمل» / «حذف العمل».

## 2. Current state in the codebase
- No edit/manage page for a portfolio item; only add + delete from `me/profile`.
- No stats on portfolio items (added in `slide-22`).

## 3. Gap
There's no owner-facing manage/edit screen with tabs, quick actions (preview/copy-link/
delete), or per-item stats.

## 4. Plan

### Backend
1. Reuse `PATCH /me/portfolio/<id>` (from `slide-23`) for edits and the counters from
   `slide-22` for the stats tab. Add a "copy link" → the public detail URL (`slide-22`).

### Frontend
2. New route `frontend/app/me/portfolio/[id]/page.tsx` (manage) with tabs:
   - البيانات الأساسية → the edit form (`PortfolioProjectForm`, prefilled, with status).
   - التسعير والملفات → files management.
   - إحصائيات العمل → views/likes/saves/shares cards.
   - Right rail: summary + quick actions (معاينة → `slide-22`, نسخ الرابط, حذف) + tips.
3. Link here from the portfolio list / profile management.

## 5. Acceptance criteria
- Owner can open a saved work, edit it across tabs, see stats, copy its public link, preview,
  and delete.

## Dependencies
Edit endpoint + form from `slide-23`; stats from `slide-22`; public detail `slide-22`.
