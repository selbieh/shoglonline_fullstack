# Slide 11 — شاشة البروفايل (رؤية النفس) (freelancer profile, self view)

- **Module:** Freelancer Profile · self/own public profile
- **PPT screen:** «مقترح شاشة البروفايل (رؤية النفس)».
- **Status:** ⚠️ partial — rich layout missing; data mostly exists.

## 1. What the slide proposes
A full profile page the freelancer sees of themselves, with a **two-column** layout:
- **Header/left:** intro video, name + verified badge, professional title, location, member
  since, hourly price ($20), rating (4.9 · 53), `18 مشروع مكتمل`, `متوسط رد خلال ساعتين`,
  online status pill.
- **Right rail:** name card, hourly price, status «حالة التحقق» (email/phone/ID/payment),
  «التعليم والشهادات», «الخبرات العملية».
- **Action buttons:** «تعديل الملف», «معاينة الملف العام», «الإعدادات».
- **Body sections:** المهارات (with levels), مهامي/completed tasks table, خدماتي المميزة
  (featured services with price/rating), معرض أعمالي (portfolio grid), footer.

## 2. Current state in the codebase
- `frontend/app/freelancers/[id]/page.tsx` (public detail): single-column stack — hero,
  overview, portfolio, skills (no level), languages, employment, education. **No right
  rail**, no featured services, no reviews, no completed-count, no response-time, no
  availability pill, no video.
- `frontend/app/me/profile/page.tsx` is the **edit** page (not this read/preview view).
- Backend provides rating_avg/count, total_earned, is_verified; **no** response-time,
  completed-count, video, availability (see slides 07, 02).

## 3. Gap
The "self view" read profile doesn't exist as designed; the public detail page is a thin
single column missing the right rail, verification panel, featured services, completed/
response-time stats, video, skill levels, and the self-only action buttons.

## 4. Plan

### Backend
1. Add derived fields to the public profile serializer: `completed_contracts_count`,
   `avg_response_time` (from chat/contract data), plus the new `availability`, `video`,
   `skill levels` (slides 07/02/04). Add a verification summary (email/phone/ID/payment).
2. Featured services: expose the worker's `live` gigs (limit N) on the profile payload.

### Frontend
3. Rebuild the profile view into a 2-column layout (RTL): main column (video, header, bio,
   skills w/ levels, completed tasks, featured services, portfolio) + right rail (price,
   verification status, education+certs, experience).
4. Add self-view affordances when `viewer === owner`: «تعديل الملف» → `/me/profile`,
   «معاينة الملف العام» → others' view (`slide-12`), «الإعدادات» → `/settings`.
5. Reuse this component for `slide-12` (others' view) with a `viewMode` prop swapping the
   action buttons (edit/settings vs hire/message).

## 5. Acceptance criteria
- Self view shows the 2-column layout with right rail, featured services, verification
  panel, skill levels, completed count, response time, and online/availability pill.
- Self-only buttons appear only to the owner.

## Dependencies
Shares a component with `slide-12`. Needs data from slides 02/04/06/07. Featured services
from gigs (`slide-17`). No external contact (`slide-01`).
