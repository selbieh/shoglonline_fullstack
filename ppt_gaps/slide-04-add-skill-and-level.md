# Slide 04 — إضافة المهارة ومستوى المهارة (add skill + level)

- **Module:** Freelancer Profile · skill picker (used by step 2)
- **PPT screen:** «إضافة المهارات ومستوى المهارة».
- **Status:** ⚠️ partial — **4 levels** required, backend has 3.

## 1. What the slide proposes
- **المهارات** — searchable select / dropdown ("ابحث عن مهارة أو اختر من القائمة").
- **مستوى المهارة** (skill level) — 4 radio options: **مبتدئ / متوسط / متقدم / خبير**
  (beginner / intermediate / advanced / **expert**).
- **إضافة المهارة** button → appends a chip "اسم المهارة — المستوى" with a remove ✕.
- "أضف من 3 إلى 15 مهارة" + suggested chips.

## 2. Current state in the codebase
- `apps/profiles/models.py` → `WorkerSkill.Efficiency`: `beginner / intermediate / advanced`
  (**only 3**; no `expert`).
- `frontend/app/me/profile/page.tsx` maps `{ beginner:"مبتدئ", intermediate:"متوسط",
  advanced:"متقدم" }` and has an add-skill dropdown (no per-add level selector UI like the slide).
- Skill catalog served from `/skills` (`catalog.Skill`).

## 3. Gap
- The 4th level **خبير / expert** does not exist in the model, serializer, or UI.
- The add-skill UX is a plain dropdown, not the "pick skill → pick level → add chip" flow
  with a 4-way radio.

## 4. Plan

### Backend
1. Add `EXPERT = "expert", "خبير"` to `WorkerSkill.Efficiency` choices. Migration
   `apps/profiles/migrations/000X_workerskill_expert_level.py`. (No data backfill needed.)
2. Confirm `WorkerSkillSerializer` accepts `expert`.

### Frontend
3. Extend the label map to include `expert: "خبير"` in `me/profile` **and** anywhere skill
   levels render (public profile `slide-12`).
4. Build a reusable `SkillPicker` component: search input over `/skills`, a 4-way level
   radio (مبتدئ/متوسط/متقدم/خبير), "إضافة المهارة" button, chip list with ✕, dedupe guard,
   3–15 count hint. Use it in wizard step 2 (`slide-03`) and `me/profile`.

## 5. Acceptance criteria
- A skill can be saved at level "خبير" and renders as "اسم — خبير" on edit and public views.
- Duplicate skills are blocked; min/max (3–15) hinted.

## Dependencies
Drives `slide-03`, `slide-11`, `slide-12`. **Phase-1 foundation** — do early.
