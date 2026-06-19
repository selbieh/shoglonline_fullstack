# Slide 18 — خدمات المستقل (رؤية الغير) (public services on a freelancer)

- **Module:** Freelancer Profile · public services grid (others' view)
- **PPT screen:** «مقترح شاشة خدمات المستقل (رؤية الغير)».
- **Status:** ⚠️ partial

## 1. What the slide proposes
A visitor viewing a freelancer's services:
- Top profile header: avatar + name + verified, title (UI/UX), location, response time,
  rating (4.9 · 68), `المشاريع المنجزة 128`, member since, **توظيف المستقل** + **مراسلة**.
- «خدمات المستقل — عدد الخدمات المنشورة: 6», sort «الأحدث», search.
- Service cards: cover image, title, description, «يبدأ من $X», rating, delivery «X أيام»,
  **عرض الخدمة**.

## 2. Current state in the codebase
- Public freelancer detail (`freelancers/[id]`) doesn't list the freelancer's gigs.
- `frontend/app/services/page.tsx` is the global services catalog (all workers), with cards
  and filters — good card pattern to reuse, but not scoped to one freelancer.
- Backend: `GET /services` (public, live only) supports filters; no `?worker=<id>` scoping
  surfaced for "this freelancer's services".

## 3. Gap
No per-freelancer public services grid with the profile header + hire/message. Need a
worker-scoped services query and a tabbed/linked section from the public profile.

## 4. Plan

### Backend
1. Add `worker` filter to `GET /services` (live only) so the frontend can fetch a single
   freelancer's published gigs. Include cover, price-from, rating, delivery.

### Frontend
2. Add a services section/tab to the public profile (`slide-12`) — or a dedicated
   `/freelancers/[id]/services` — reusing the service card from `services/page.tsx`.
3. Render the profile header (shared with `slide-12`) with توظيف/مراسلة, the count, sort, and
   search; cards link to the service detail buyer view (`slide-21`).

## 5. Acceptance criteria
- Visiting a freelancer shows their published services in a grid with sort/search and the
  profile header CTAs; cards open the buyer service view.

## Dependencies
Profile header shared with `slide-12`. Card reused from global services. Detail: `slide-21`.
