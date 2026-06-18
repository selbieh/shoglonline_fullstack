# PART 05 — Engagement Completeness (notifications, prefs, tickets, chat reports)

**Goal:** finish the notification/engagement surfaces and the ticket state machine to the SRS letter.
**Depends on:** Parts 01–02.
**SRS refs:** FR-NOT-3/4, FR-PROF-5/9, FR-TKT-2, FR-CHAT-10, BR-14/16. **Reference:** GAP Phase 12.
**Flags (all exist in §22.1 unless noted):** `emails.enabled`, `emails.chat_unread_enabled`, `subscriptions.enabled` + `subscriptions.email_mode`, `profiles.offline_reminder_days`, `tickets.auto_solve_days` + `tickets.auto_close_days`, `chat.banned_words`; **new (optional):** `notifications.broadcast_enabled`.
**Effort:** M

## Steps

### Admin notifications — FR-NOT-3/4
1. [x] `apps/notifications/services.broadcast(...)` + admin compose UI: title+message, audience = specific users (search/add) | all-workers | all-employers | everyone. Audience is **activity-based, independent of view toggle**: "workers" = completed worker profile or ≥1 proposal/service; "employers" = ≥1 posted job or service request; dual-active users receive each broadcast **once**.
2. [x] Scheduled notifications: `ScheduledNotification` + Celery ETA dispatch + admin management of pending items; history list/search/delete.

### Preferences & reminders — FR-PROF-9 / FR-PROF-5 / BR-16
3. [x] `NotificationPreference` per user (categories: chat-unread, new-job-in-category, proposal events, marketing) within admin-allowed categories; **enforce in `notify()` / email dispatch**.
4. [x] Offline-reminder Celery task: worker Offline ≥ `profiles.offline_reminder_days` (default 10) → reminder email (idempotent, once per window). Add to beat schedule.

### Ticket state machine — FR-TKT-2 / BR-14
5. [x] Extend tickets from `open/answered/solved/closed` to the full table: **Open → Pending → On-Hold → Solved → Closed**. Add **On-Hold (with mandatory reason)** and Pending semantics; preserve dispute coupling (closing a dispute-coupled ticket blocked until BR-22 outcome). Update transition validation + Unfold actions.

### Chat abuse — FR-CHAT-10 (Should)
6. [x] `Report` entity (reporter, target message/conversation, reason, status open/dismissed/actioned) + `POST /chat/conversations/{id}/report`; admin review queue with actions (dismiss/warn/freeze/archive). Banned-words list already filters; add chat-send rate-limit.

## Tests to add
- `tests/integration/test_broadcast.py` — ✅ audience resolution (worker/employer/dual once); 🔐 staff-only; `emails.enabled` OFF stops email leg instantly (**AC-8**).
- `tests/tasks/test_scheduled_notifications.py` — ETA fires at the scheduled time (frozen clock); pending management.
- `tests/integration/test_notification_prefs.py` — opting out suppresses that category in `notify()` + email.
- `tests/tasks/test_offline_reminder.py` — fires at threshold, once per window (frozen clock) (**BR-16**).
- `tests/integration/test_tickets_onhold.py` — On-Hold needs reason; full transition table incl. illegal moves (**BR-14**).
- `tests/integration/test_chat_reports.py` — report → admin queue → action; rate-limit triggers.

## Exit criteria (maps **AC-8 / AC-9**)
- [x] Admin instant + scheduled broadcasts deliver to the chosen audience; email kill-switch stops sends ≤60s.
- [x] Preferences honored across in-app/email; offline reminder fires once at threshold.
- [x] Ticket machine matches §9.8 incl. On-Hold + dispute-coupling guard; chat reports reach an admin queue.
