# Slide 21 — الخدمة برؤية المشتري (service detail, buyer view)

- **Module:** Services · public buyer detail
- **PPT screen:** «مقترح شاشة الخدمة برؤية المشتري».
- **Status:** ⚠️ partial

## 1. What the slide proposes
- Banner/gallery, title, rating (4.9 · 210), «تم طلب الخدمة X مرة».
- Right buy panel: price «100 ر.س», deliverables checklist (عدد الصفحات/متجاوب/دعم/تسليم),
  **طلب الخدمة** + **تواصل مع المستقل**, service info (orders, avg rating, response time,
  current orders), freelancer card (member since, completed projects, satisfaction %),
  «عرض الملف الشخصي» + «تواصل مع المستقل».
- وصف الخدمة, معرض أعمال الخدمة, كلمات مفتاحية, آراء المشترين (128), خدمات قد تنال إعجابك,
  **الإبلاغ عن مخالفة** (report).

## 2. Current state in the codebase
- `frontend/app/services/[slug]/page.tsx` (SSR) + `BuyBox.tsx`: shows title, worker name,
  delivery, price, favorite, add-ons selection, quantity, custom description, and a purchase
  request POST. **Missing**: deliverables checklist, gallery, keywords, reviews, freelancer
  card, "you may like", report, request-count, satisfaction %.
- Backend `GET /services/<slug>` public; add-ons + favorites supported.

## 3. Gap
The buyer detail is functional but thin: no deliverables/what-you-get, gallery, keywords,
reviews, freelancer card, related services, or report; "contact freelancer" entry needed.

## 4. Plan

### Backend
1. Include in the public service payload: `what_you_get`, gallery images, `keywords`,
   `rating_avg/count`, `orders_count`, request-count, and the worker summary (member since,
   completed projects, satisfaction). Most come from `slide-19`/`slide-17` work.
2. Reviews via reviews app; "related services" via category query.
3. Report → tickets app (subject = service).

### Frontend
4. Expand `services/[slug]`: gallery carousel, deliverables checklist, keywords chips,
   reviews section, freelancer card (with «عرض الملف» → `slide-12` and «تواصل» → chat),
   related-services row, and a report-violation action.
5. Keep BuyBox (price/add-ons/qty/«طلب الخدمة»); add «تواصل مع المستقل» (start chat).

## 5. Acceptance criteria
- Buyer sees gallery, deliverables, keywords, reviews, freelancer card, and related
  services; can request the service and contact the freelancer; can report a violation.

## Dependencies
Data from `slide-19`/`slide-20`. Freelancer card → `slide-12`. Chat + tickets + reviews apps.
