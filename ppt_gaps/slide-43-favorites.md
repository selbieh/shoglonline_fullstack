# Slide 43 — المفضلة (favorites / watchlist)

- **Module:** Account Settings · المفضلة
- **PPT screen:** «الإعدادات → المفضلة».
- **Status:** ⚠️ partial — favorites exist for **services only**.

## 1. What the slide proposes
- Title «المفضلة — احفظ ما يعجبك … قد تتضمن المفضلة وظيفة، أو مستقلًا، أو خدمة، أو عملًا من
  معرض الأعمال».
- **Tabs:** الكل · الوظائف · الخدمات · المستقلون · معرض الأعمال.
- Search «ابحث في المفضلة» + sort «الأحدث حفظًا».
- Cards (mixed types) with a type badge (وظيفة / خدمة / مستقل / عمل): title, meta, price/
  budget/rating, **عرض** (view) + **إزالة** (remove).

## 2. Current state in the codebase
- `frontend/app/me/favorites/page.tsx` (new/untracked): lists favorited **services** only —
  cover, title, worker, category, price, remove. Backend `ServiceFavorite` (gigs app) +
  `GET /me/favorites`, `PUT/DELETE /me/favorites/<service_id>`.
- **No** favoriting for jobs, freelancers, or portfolio items; **no tabs/search/sort**.

## 3. Gap
Favorites cover only services. Need polymorphic favorites across 4 types (jobs, services,
freelancers, portfolio works) with tabs, search, and sort.

## 4. Plan

### Backend
1. Generalise favorites to a polymorphic `Favorite(user, content_type, object_id)` (or
   per-type tables) supporting job / service / worker-profile / portfolio-item. Keep the
   existing `ServiceFavorite` working (migrate or wrap).
2. Endpoints: `GET /me/favorites?type=all|jobs|services|freelancers|portfolio` (+ search,
   sort), `PUT/DELETE /me/favorites/<type>/<id>`. Update favorite buttons on each surface
   (services already; add jobs/freelancers/portfolio).

### Frontend
3. Move favorites under the settings shell (`/settings/favorites`, `slide-30`) — keep
   `me/favorites` redirecting.
4. Build tabs (الكل/الوظائف/الخدمات/المستقلون/معرض الأعمال), search, sort, and a card
   renderer per type with a type badge + عرض/إزالة. Optimistic remove.
5. Add heart/favorite toggles on job cards, freelancer cards, and portfolio items.

## 5. Acceptance criteria
- Favorites supports all 4 types with tabs, search, and sort; items can be favorited from
  their source surfaces and removed from here.

## Dependencies
Heart toggles on jobs / freelancers (`slide-12`) / portfolio (`slide-22`). Shell `slide-30`.
Existing service favorites in gigs app.
