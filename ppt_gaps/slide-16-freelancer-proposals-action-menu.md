# Slide 16 — عروض المستقل (قائمة منسدلة) (proposal row action menu)

- **Module:** Freelancer dashboard · عروضي row actions
- **PPT screen:** «مقترح شاشة عروض المستقل (قائمة منسدلة)».
- **Status:** ⚠️ partial — some actions missing (edit, message, report).

## 1. What the slide proposes
Per-proposal `⋮` dropdown: **عرض التفاصيل** · **عرض المشروع** (view project/job) · **تعديل
العرض** (edit offer) · **سحب العرض** (withdraw) · **مراسلة صاحب العمل** (message client) ·
**الإبلاغ عن مشكلة** (report). Items gated by status.

## 2. Current state in the codebase
- `me/proposals` supports **view job** (link via `job_slug`) and **withdraw/cancel** (for
  cancellable statuses). **Missing**: edit offer, message client, report — confirmed by
  exploration.
- Backend `Proposal` has no edit endpoint; proposals appear immutable after submit.

## 3. Gap
No edit-offer capability (model + endpoint + UI), no "message client" entry point from a
proposal, no "report" action, and no per-row dropdown.

## 4. Plan

### Backend
1. **Edit offer**: add `PATCH /me/proposals/<id>` allowing edits to budget/delivery_days/
   description **only while** status ∈ {pending_approval, submitted, viewed} (not after
   accept). Validate + audit.
2. **Message client**: ensure a conversation can be started from a proposal's job/employer
   (chat app). 
3. **Report**: route to the tickets app (`apps/tickets`) with a "proposal/job" subject, or a
   lightweight report endpoint.

### Frontend
4. Reuse `RowActionMenu` (`slide-14`) on each proposal row with the 6 items gated by status:
   - تعديل العرض → edit modal (only editable statuses).
   - سحب العرض → existing withdraw.
   - عرض المشروع/التفاصيل → job page.
   - مراسلة صاحب العمل → start chat.
   - الإبلاغ عن مشكلة → report/ticket modal.

## 5. Acceptance criteria
- Editable proposals can be updated; withdraw/message/report all work from the row menu;
  disabled items reflect status.

## Dependencies
Builds on `slide-15`. Shares `RowActionMenu` with `slide-14`. Chat + tickets apps.
