# Slide 13 — مهام المستقل (freelancer "my tasks")

- **Module:** Freelancer dashboard · مهامي
- **PPT screen:** «مقترح شاشة مهام المستقل». Dashboard shell with left nav.
- **Status:** ⚠️ partial — contracts exist; status-tab bar with counts + dashboard shell missing.

## 1. What the slide proposes
- A **dashboard layout** with a left nav rail: لوحة التحكم, الملف الشخصي, تصفح المشاريع,
  عروضي, **مهامي**, خدماتي المميزة, معرض أعمالي, الرسائل, المحفظة, التقييمات, الإشعارات,
  الإعدادات, التحقق. Top bar: home, notifications, messages, help, profile menu.
- **Status filter tabs with counts:** الكل 24 · قيد التنفيذ 6 · بانتظار التسليم 3 ·
  بانتظار الاعتماد 4 · مكتملة 8 · مغلقة 2 · في نزاع 1.
- Task rows: icon, title, description, «صاحب العمل» (client) + rating, «قيمة المهمة» (value),
  «تاريخ التسليم» (delivery date) + countdown, status pill.

## 2. Current state in the codebase
- `frontend/app/contracts/page.tsx` lists contracts with **role** tabs (الكل / كصاحب عمل /
  كمستقل), **not** status tabs, and **no counts**. Rows show title/role/counterpart/budget/
  status. Detail at `contracts/[id]`.
- Backend `GET /me/contracts` supports `status` + `role` filters. Contract statuses:
  `pending_funding, active, delivered, completed, disputed, cancelled`.
- The deck's labels map roughly: قيد التنفيذ→active, بانتظار التسليم→active (no submission yet),
  بانتظار الاعتماد→delivered, مكتملة→completed, مغلقة→cancelled, في نزاع→disputed.
- No persistent dashboard left-nav shell; pages are standalone with `SiteHeader`.

## 3. Gap
Missing: status-based tab bar **with live counts**, the richer task-row layout (value +
delivery countdown + client rating), and the dashboard left-nav shell. Also the deck's
"بانتظار التسليم vs بانتظار الاعتماد" split needs a derived sub-status.

## 4. Plan

### Backend
1. Add a counts endpoint or include counts in `GET /me/contracts?role=worker` response
   (e.g. `?with_counts=1` returning `{status: count}`), covering the deck's buckets. Derive
   "بانتظار التسليم" (active & no open submission) vs "بانتظار الاعتماد" (delivered) server-side.
2. Ensure each contract row includes counterpart name + rating, value, deadline.

### Frontend
3. Build a shared `DashboardLayout` (left nav + topbar) and mount مهامي, عروضي, خدماتي,
   معرض under it (slides 13–17). Keep `SiteHeader` for public pages.
4. Build the status tab bar with counts; clicking filters `GET /me/contracts?status=…&role=worker`.
5. Redesign task rows per the slide (icon, client+rating, value, delivery date + countdown,
   status pill). Link to `contracts/[id]`.

## 5. Acceptance criteria
- مهامي shows the 7 status tabs with correct counts and filters the list.
- Rows show client+rating, value, delivery countdown, and status; live in the dashboard shell.

## Dependencies
Action menu: `slide-14`. Shares `DashboardLayout` with slides 15/17. Statuses from
`contractStatus.ts`.
