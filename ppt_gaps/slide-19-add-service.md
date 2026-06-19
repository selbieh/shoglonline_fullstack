# Slide 19 — إضافة الخدمة (add new service / gig)

- **Module:** Freelancer dashboard · create gig
- **PPT screen:** «مقترح شاشة إضافة خدمة جديدة».
- **Status:** ⚠️ partial — backend supports most fields; UI is a single inline form.

## 1. What the slide proposes
A **multi-step** create-service flow (right-side step rail): مطلومات الخدمة الأساسية →
الصورة والوصف → ماذا سيحصل عليه → معرض الأعمال → تطورات الخدمة → مراجعة ونشر. Fields:
- **عنوان الخدمة**, **التصنيف** + **التصنيف الفرعي**, **سعر الخدمة (ريال)**, **مدة التسليم**,
  **كلمات مفتاحية** (keywords/tags).
- **الصورة الأساسية** (cover) + **وصف الخدمة** (rich text).
- **ماذا سيحصل عليه من شراء الخدمة** (what buyer gets — bullet list, 0/1000).
- **معرض أعمال الخدمة** (images/video gallery).
- **تطورات الخدمة (إضافات)** (add-ons: تفاصيل التطوير + سعر + مدة تسليم إضافية + إجراءات).
- **ملخص السعر** (price summary: base + upgrades = total). **حفظ كمسودة** / **نشر الخدمة**.

## 2. Current state in the codebase
- `me/services` add form: title, description, category, base_price, delivery_days — single
  step, **no cover image, no keywords, no "what buyer gets", no gallery, no add-ons in
  create, no review step**.
- Backend `apps/gigs`: `Service` has title, slug, description, category, subcategory,
  base_price, delivery_days, `cover_image` (single URL), status. `ServiceAddon`
  (title/price/extra_days) exists. **Missing**: keywords/tags, "what buyer gets" field,
  multi-image gallery model.

## 3. Gap
The create flow isn't multi-step and omits cover upload, keywords, deliverables, gallery,
and add-on creation. Backend lacks keywords, deliverables, and a gallery model.

## 4. Plan

### Backend
1. Extend `Service`: `keywords` (JSON/array or M2M tags via `lib/tags`), `what_you_get`
   (TextField, ≤1000), and a `ServiceImage` gallery model (FK→Service, attachment, order) —
   `cover_image` stays as the primary. Migration.
2. Allow creating `ServiceAddon`s in the same create payload (nested write).
3. Validate; apply contact guard (`slide-01`) to description/what_you_get.

### Frontend
4. Build a multi-step service-create wizard (reuse `WizardStepper` from `slide-10`):
   step 1 basics (title/category/subcategory/price/delivery/keywords), step 2 cover +
   description, step 3 deliverables, step 4 gallery, step 5 add-ons (repeatable rows),
   step 6 review + (حفظ كمسودة / نشر).
5. Live price summary (base + selected upgrades). Drafts use `status=draft`.

## 5. Acceptance criteria
- A gig can be created end-to-end with cover, keywords, deliverables, gallery, and add-ons,
  saved as draft or published; price summary reflects base + upgrades.

## Dependencies
Owner view: `slide-20`. Buyer view: `slide-21`. Stepper: `slide-10`. Categories: `catalog`.
