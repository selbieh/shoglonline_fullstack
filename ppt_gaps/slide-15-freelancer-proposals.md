# Slide 15 — عروض المستقل (freelancer "my proposals")

- **Module:** Freelancer dashboard · عروضي
- **PPT screen:** «مقترح شاشة عروض المستقل».
- **Status:** ⚠️ partial — list + status tabs exist; counts + richer rows + search missing.

## 1. What the slide proposes
- Search «ابحث بعنوان المهمة».
- **Status tabs with counts:** الكل 24 · بانتظار الموافقة 6 · قيد التنفيذ 5 · مكتملة 8 ·
  مستبعدة 2 · معلقة 2 · ملغية 1.
- Proposal rows: icon, title, «صاحب العمل» + rating, «قيمة العرض» (offer value), «مدة التنفيذ»
  (execution days), «تاريخ التقديم» (submission date), status pill.

## 2. Current state in the codebase
- `frontend/app/me/proposals/page.tsx` already lists proposals with status tabs derived from
  `PROPOSAL_STATUS_LABEL` (pending_approval, submitted, viewed, accepted, rejected,
  cancelled, withdrawn) and color tones, with cancel for cancellable statuses. **No counts**
  on tabs, **no search**, rows are simpler (title/budget/days/time/status).
- `frontend/app/bids/page.tsx` is the bid-credits system (not proposals).
- Backend: proposals live in `apps/jobs` (`Proposal`), surfaced via the proposals list API.

## 3. Gap
Missing per-tab counts, a search box, the client name+rating column, and the deck's exact
status buckets (e.g. "قيد التنفيذ"/"مكتملة" correspond to accepted→contract states, which
live in contracts, not proposals — need mapping).

## 4. Plan

### Backend
1. Add counts to the proposals list response (or a `?with_counts=1`), and a `search` param
   over job title.
2. Decide the mapping for "قيد التنفيذ/مكتملة": these reflect the **contract** spawned from an
   accepted proposal. Either join contract status into the proposal row, or treat
   accepted+active as "قيد التنفيذ" and completed contract as "مكتملة". Expose a derived
   `display_status` so the UI tabs match the deck.

### Frontend
2. Add the search box and per-tab counts to `me/proposals`.
3. Enrich rows: client name + rating, offer value, execution days, submission date, status
   pill using the derived `display_status`.
4. Mount under the shared `DashboardLayout` (`slide-13`).

## 5. Acceptance criteria
- عروضي shows the 7 status tabs with counts, supports title search, and rows show client +
  rating, value, days, and submission date.

## Dependencies
Action menu: `slide-16`. Shares layout with `slide-13`. Status mapping touches contracts.
