# Slide 06 — الشهادات التدريبية (training certificates)

- **Module:** Freelancer Profile · certificates (deck: "ممكن تكون جزء من شاشة التعليم")
- **PPT screen:** «الشهادات التدريبية — أضف شهاداتك لزيادة موثوقيتك», progress `60%`.
- **Status:** ❌ missing entirely (no model)

## 1. What the slide proposes
Per certificate:
- **اسم الشهادة** (name) — required.
- **الجهة المانحة** (issuer) — e.g. Google / Coursera / Udemy.
- **نوع الشهادة** (type) — select (شهادة تدريبية ...).
- **تاريخ الإصدار** (issue date: month + year).
- **تاريخ الانتهاء (اختياري)** (expiry) + checkbox «لا يوجد تاريخ انتهاء».
- **رقم الشهادة / Credential ID (اختياري)**.
- **رابط التحقق (اختياري)** (verification link).
- **المهارات المكتسبة** (acquired skills) — chips.
- **ملف الشهادة** (certificate file) — upload PDF/PNG/JPG ≤10MB, with thumbnail.
- **+ إضافة شهادة أخرى**.

## 2. Current state in the codebase
- `apps/profiles/models.py` has `Education` (school/degree/area/dates/description) but **no
  certificate model**. The deck suggests certificates can live alongside education.
- No API, no serializer, no UI for certificates.

## 3. Gap
Certificates are completely absent. Need model + API + serializer + a form (its own wizard
sub-section or merged into the education step).

## 4. Plan

### Backend
1. New model `Certificate(profile FK→WorkerProfile)`: `name`, `issuer`, `cert_type`,
   `issued_month`, `issued_year`, `expiry_month`, `expiry_year`, `no_expiry` (bool),
   `credential_id` (blank), `verification_link` (URLField, blank), `skills` (M2M/JSON),
   `attachment` (GenericRelation for the file), `order`, `created_at`. Migration.
2. Serializer + nested write under `WorkerProfileSerializer` (replace-all, like
   educations/employments) **or** dedicated `GET/POST/DELETE /me/certificates`.
   Recommended: nested replace-all to match the existing pattern.
3. Validate file type/size on upload; apply contact guard to `name`.

### Frontend
4. `CertificateForm` (add/list/remove): name, issuer, type select, issue month/year,
   expiry month/year + "no expiry" checkbox (disables expiry), credential ID, verification
   link, skills chips, file dropzone with thumbnail.
5. Render in the wizard step (or as a sub-card under Education per the deck note) and in
   `me/profile`; surface on public profile under "التعليم والشهادات" (`slide-11/12`).

## 5. Acceptance criteria
- A certificate with file + verification link saves and shows in edit + public profile.
- "لا يوجد تاريخ انتهاء" hides/clears the expiry inputs.

## Dependencies
Skills source: `slide-04`. Public display: `slide-11`, `slide-12`. Attachments pipeline
(Part 03). **Phase-1 foundation** (new model).
