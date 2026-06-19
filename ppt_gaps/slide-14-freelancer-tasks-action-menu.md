# Slide 14 — مهام المستقل (قائمة منسدلة) (task row action menu)

- **Module:** Freelancer dashboard · مهامي row actions
- **PPT screen:** «مقترح شاشة مهام المستقل (قائمة منسدلة)».
- **Status:** ⚠️ partial — actions exist on the detail page, not as a per-row menu.

## 1. What the slide proposes
A per-task `⋮` dropdown with: **عرض التفاصيل** (view details) · **فتح المحادثة** (open chat) ·
**عرض الملفات** (view files) · **تسليم العمل** (deliver work) · **طلب تمديد** (request
extension) · **الإبلاغ عن مشكلة** (report a problem). Items shown conditionally by status.

## 2. Current state in the codebase
- All these actions exist on `frontend/app/contracts/[id]/page.tsx`:
  deliver (submission textarea), update-request (budget/deadline ≈ extension), cancel,
  dispute, and `openChat()` to start/continue a conversation.
- Backend endpoints exist: `/contracts/<id>/submissions` (deliver), `/contracts/<id>/update-
  requests` (extension), `/contracts/<id>/dispute`, `/contracts/<id>/cancel`. Files via the
  submission `attachments`.
- **No per-row dropdown** on the list; user must open the contract to act.

## 3. Gap
The convenience action menu on each task row is missing; "طلب تمديد" should map to an
UpdateRequest with only a new deadline (today it's a combined budget/deadline form);
"عرض الملفات" needs a quick files view.

## 4. Plan

### Backend
1. Reuse existing endpoints. Optionally add a lightweight "extension only" variant of
   update-request (new_deadline without new_budget) — the model already allows null budget.

### Frontend
2. Add a reusable `RowActionMenu` (`⋮`) component (keyboard-accessible, RTL).
3. On each مهامي row, render the menu with items gated by status:
   - عرض التفاصيل → `contracts/[id]`.
   - فتح المحادثة → `openChat()` (existing).
   - عرض الملفات → modal listing submission attachments.
   - تسليم العمل → deliver modal (only when `canDeliver`).
   - طلب تمديد → extension modal (new deadline).
   - الإبلاغ عن مشكلة → dispute modal.
4. Mirror the same menu pattern on proposals (`slide-16`).

## 5. Acceptance criteria
- Each task row exposes the 6 actions, correctly enabled/disabled by status, all wired to
  the existing flows without opening the detail page first.

## Dependencies
Builds on `slide-13`. Shares `RowActionMenu` with `slide-16`. Backend already present.
