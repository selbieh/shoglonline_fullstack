# Slide 28 — لوحة تحكم صاحب العمل (رؤية النفس) (employer dashboard)

- **Module:** Client / Employer Profile · dashboard
- **PPT screen:** «لوحة تحكم صاحب العمل».
- **Status:** ⚠️ partial — a dashboard exists; the rich employer layout does not.

## 1. What the slide proposes
- **+ إضافة مهمة جديدة** (post task).
- KPI cards: المهام المكتملة 28 · قيد المراجعة 4 · قيد التنفيذ 7 · المهام المفتوحة 12 ·
  «الرصيد المتاح في المحفظة 3,250 ر.س» + «شحن المحفظة».
- **إجراءات سريعة**: نشر مشروع جديد · شحن المحفظة · طلب خدمة · مركز المساعدة.
- **حالة التحقق** (80%): البريد · وثائق الشركة · رقم الجوال · وسيلة الدفع — «إدارة التحقق».
- **النشاط الأخير** (recent activity feed).
- Open-tasks table: عنوان المهمة, الميزانية, العروض (proposals count), تاريخ النشر, الحالة,
  إجراءات (`⋮` + chat).

## 2. Current state in the codebase
- `frontend/app/dashboard/page.tsx` exists (has tests) — current employer/worker dashboard.
  Needs review for parity but does **not** match this layout (KPI cards, wallet card,
  verification meter, quick actions, recent activity, open-tasks table).
- Data available: jobs (`apps/jobs`, statuses + `proposals_count`), wallet (`/me/wallet`),
  contracts (counts), verification (email/phone/ID + payment method presence).

## 3. Gap
The employer dashboard layout (KPIs, wallet balance + charge, quick actions, verification
progress with 4 channels incl. «وثائق الشركة» + «وسيلة الدفع», recent activity, open-tasks
table with proposals count + actions) is not built.

## 4. Plan

### Backend
1. Add an employer dashboard summary endpoint `GET /me/employer-dashboard` (or compose
   client-side) returning: task counts by status, wallet available, verification status
   (email/company-docs/phone/payment-method) + percent, recent activity, and the open-tasks
   list with proposals_count.
2. "وسيلة الدفع" channel = has a saved payment method (`/me/payment-methods`).

### Frontend
3. Rebuild `app/dashboard` for employers: KPI cards row, wallet card + «شحن المحفظة»
   (→ `slide-33`), quick-actions grid, verification progress card (4 channels + «إدارة
   التحقق»), recent-activity list, open-tasks table (budget, proposals count, publish date,
   status, `⋮` actions + chat). «+ إضافة مهمة جديدة» → job post.
4. Keep the worker dashboard variant separate (or branch by `active_mode`).

## 5. Acceptance criteria
- Employer dashboard shows KPIs, wallet + charge, quick actions, 4-channel verification %,
  recent activity, and an open-tasks table with proposals counts and row actions.

## Dependencies
Jobs + contracts + wallet + verification + payment methods. Charge: `slide-33`. Verify:
`slide-27`/`slide-31`. (Employer "others' view" = `slide-29`, out of scope.)
