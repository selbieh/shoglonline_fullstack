# Slide 17 — خدمات المستقل (برؤية المستقل نفسه) (my services management)

- **Module:** Freelancer dashboard · خدماتي المصغرة
- **PPT screen:** «مقترح شاشة خدمات المستقل (برؤية المستقل نفسه)».
- **Status:** ⚠️ partial — management list exists; status tabs + rich rows missing.

## 1. What the slide proposes
- **+ إضافة خدمة جديدة** button.
- Search «ابحث بعنوان الخدمة».
- **Status tabs with counts:** الكل 18 · منشورة 10 · قيد المراجعة 2 · مسودة 2 · مرفوضة 2 ·
  موقوفة 2.
- Service rows: cover thumb, title + status pill, «السعر يبدأ من $X», «تقييم 4.9 (128)»,
  «طلبات 38», «تحديث أخير», actions: **تعديل الخدمة** / **معاينة** / `⋮`.
- Pagination + per-page select.

## 2. Current state in the codebase
- `frontend/app/me/services/page.tsx`: lists services with inline status actions
  (pause/resume/publish/view) and an add form; **no status tab bar with counts**, **no
  search**, rows lack rating/orders/cover/last-update layout.
- Backend `apps/gigs` Service statuses: `draft, pending_review, live, paused, archived,
  rejected` — maps to deck (منشورة=live, قيد المراجعة=pending_review, مسودة=draft,
  مرفوضة=rejected, موقوفة=paused). `GET /me/services` returns all.
- Stats: only `favorites_count` denormalized; **no orders/rating/views** on the gig (rating
  lives on contracts/reviews).

## 3. Gap
Missing status tabs+counts, search, and per-row stats (rating, orders, last update, cover).
Orders/rating aren't aggregated on the gig yet.

## 4. Plan

### Backend
1. Add counts + `search` to `GET /me/services` (per-status counts for the tabs).
2. Aggregate per-gig stats: `orders_count` (accepted buying-requests/contracts from this
   gig), `rating_avg`/`rating_count` (reviews of contracts originating from the gig),
   `updated_at`. Add to the serializer.

### Frontend
3. Build status tab bar with counts + search; filter `GET /me/services?status=…&q=…`.
4. Redesign rows: cover thumb, title+status, price-from, rating(count), orders, last update,
   and actions (تعديل → service edit `slide-20`; معاينة → buyer view `slide-21`; `⋮` for
   pause/resume/publish/archive/delete).
5. Add pagination. Mount under `DashboardLayout` (`slide-13`).

## 5. Acceptance criteria
- خدماتي shows 6 status tabs with counts, search, and rows with rating/orders/price/cover;
  add/edit/preview/status actions all work.

## Dependencies
Add service: `slide-19`. Owner view: `slide-20`. Buyer view: `slide-21`. Layout: `slide-13`.
