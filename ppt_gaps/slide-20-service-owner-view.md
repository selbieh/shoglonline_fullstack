# Slide 20 — الخدمة برؤية المستقل (service detail, owner view)

- **Module:** Freelancer dashboard · gig owner view + analytics
- **PPT screen:** «مقترح شاشة الخدمة برؤية المستقل».
- **Status:** ⚠️ partial

## 1. What the slide proposes
Owner's view of one service:
- Banner/gallery, title, rating (4.9 · 110), «إيقاف عن مشاهدة».
- **تطورات الخدمة** (upgrades) with **toggle on/off** per add-on + edit + add new.
- **حالة الخدمة** (status) toggle «منشورة», **إيقاف الخدمة مؤقتاً** (pause).
- **تعديل السعر** (edit price), وصف الخدمة (edit), كلمات مفتاحية (edit), معرض الأعمال (edit).
- **مراجعات المشترين (128)** with replies.
- **معلومات الخدمة** (category, subcategory, delivery, revisions, publish date, last update).
- **أداء الخدمة (آخر 30 يوم)**: عدد الزيارات 1,245 · عدد الطلبات 24 · معدل التحويل 1.93% (sparklines).

## 2. Current state in the codebase
- `me/services` allows status actions (pause/resume/publish/archive) and basic edit (PATCH
  `/me/services/<id>`). No dedicated owner detail page with the editable sections, add-on
  toggles, reviews, or analytics.
- Backend: add-ons exist but **no per-addon enable/disable toggle**; **no views counter, no
  orders/conversion analytics, no service-level rating aggregate** (see `slide-17`).

## 3. Gap
No owner detail page; no add-on enable/disable; no analytics (views/orders/conversion);
no editable section UI inline; reviews not surfaced on the gig.

## 4. Plan

### Backend
1. Add `ServiceAddon.is_active` (toggle) + endpoint to flip it.
2. Add a **views counter** (increment on public detail GET, e.g. `Service.views_count` or a
   daily `ServiceView` table for the 30-day window) and expose orders/conversion +
   rating_avg/count (from `slide-17` aggregates).
3. Endpoint `GET /me/services/<id>/analytics?days=30` returning visits/orders/conversion
   series.
4. Surface gig reviews (reviews of contracts spawned from the gig).

### Frontend
5. Build the owner service detail page: gallery, editable sections (price/description/
   keywords/gallery via inline edit → PATCH), add-on list with active toggles + edit/add,
   status toggle + pause, info panel, reviews list, and the analytics panel with sparklines.

## 5. Acceptance criteria
- Owner can edit all sections inline, toggle add-ons and status, see reviews, and view
  30-day visits/orders/conversion.

## Dependencies
Stats shared with `slide-17`. Add: `slide-19`. Buyer view: `slide-21`. Reviews app.
