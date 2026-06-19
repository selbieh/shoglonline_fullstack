# Slide 22 — معرض عمل فردي (رؤية الغير) (portfolio item detail page)

- **Module:** Freelancer Profile · single portfolio work detail (public)
- **PPT screen:** «مقترح شاشة معرض عمل فردي (رؤية الغير)».
- **Status:** ❌ missing (no detail page; portfolio is tiles only)

## 1. What the slide proposes
A full page for one portfolio project:
- Title, «الإبلاغ عن مخالفة», share, like; main image + thumbnail gallery («+2»).
- **عن المشروع** (about), **مميزات المشروع** (features list), **التقنيات المستخدمة** (tech:
  Figma, HTML5, CSS3, JavaScript, React, Node.js as chips).
- Right rail: **بيانات العمل** — نوع المشروع, تاريخ نشر العمل, تاريخ الإنجاز, مدة التنفيذ,
  الميزانية, القنوات/الأدوات المستخدمة, **رابط المشروع** (link).
- **صاحب العمل** card (owner) + «عرض ملف صاحب العمل» + «تواصل».
- **أعمال مشابهة** (similar works), **إحصائيات العمل** (views 1,245 · likes 256 · saves 89 ·
  shares 42).

## 2. Current state in the codebase
- `PortfolioItem` renders as tiles inside the profile/gallery only; clicking opens the raw
  `url` in a new tab. **No detail route**, no features/tech/stats/owner card/similar works.
- Fields like duration/skills/link are being added in `slide-05`/`slide-23`.

## 3. Gap
There is no portfolio-item detail page at all, and the data to populate it (features, tech,
budget, dates, stats) is largely absent.

## 4. Plan

### Backend
1. Extend `PortfolioItem` (building on `slide-05`/`slide-23`): `about`/long description,
   `features` (JSON list), `tech`/skills (reuse skills M2M), `budget` (optional), `channels`,
   `published_at`, `completed_at`, `duration`, `project_link`, and counters `views_count`,
   `likes_count`, `saves_count`, `shares_count`.
2. Add public endpoint `GET /freelancers/portfolio/<id>` (respect online/published like the
   existing `portfolio-media` rule). Increment views.
3. "Similar works" = other items by same skill/type.

### Frontend
4. New route `frontend/app/freelancers/[id]/portfolio/[itemId]/page.tsx` (SSR for SEO):
   gallery, about, features, tech chips, right-rail metadata + project link, owner card
   (→ `slide-12`, «تواصل» chat), similar works, stats. Report-violation action.
5. Make profile gallery tiles (`slide-11/12`) link to this detail page.

## 5. Acceptance criteria
- Each portfolio item has a shareable detail page with gallery, about, features, tech,
  metadata, owner card, similar works, and stats; report works; no external contact.

## Dependencies
Data model from `slide-05`/`slide-23`. Owner card `slide-12`. Tickets (report). Contact
guard `slide-01`.
