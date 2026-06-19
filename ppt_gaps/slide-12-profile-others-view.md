# Slide 12 — شاشة البروفايل (رؤية الآخرين) (freelancer profile, others' view)

- **Module:** Freelancer Profile · public profile as seen by other users
- **PPT screen:** «مقترح شاشة البروفايل (رؤية الآخرين)».
- **Status:** ⚠️ partial
- **Deck note (red):** the prior AI draft did **not** unify the data/columns; the **right
  column** (scientific experiences, etc.) must match the self-view (`slide-11`). Unify it.

## 1. What the slide proposes
Same rich 2-column layout as `slide-11`, but for a visitor:
- Primary CTAs: **توظيف المستقل** (hire freelancer) + **مراسلة** (message).
- Header: name + verified, title, rating (4.9 · 68), price «السعر بالساعة 20$», response
  time, online status.
- Right rail unified with the self view: التخصصات, أدواتي (tools), education/certs,
  experiences.
- Body: skills, completed tasks/client reviews, featured services, portfolio.
- **No external contact info** (`slide-01`).

## 2. Current state in the codebase
- `frontend/app/freelancers/[id]/page.tsx` — single column, no right rail, **no hire/message
  buttons**, no reviews section, no featured services (same gaps as `slide-11`).
- Hire flow: employers invite via jobs / buy services; "message" would create a conversation
  (chat exists). No direct "hire/message from profile" buttons today.

## 3. Gap
Public profile lacks the unified right rail, hire + message CTAs, reviews, featured services,
and the parity-with-self-view the deck explicitly calls out.

## 4. Plan

### Backend
1. Reuse the enriched public serializer from `slide-11` (same payload → guarantees column
   parity). Add `reviews` (from `reviews` app `/users/<id>/reviews`) to the profile view or
   fetch alongside.
2. "Message from profile": ensure a `POST /conversations` (or equivalent in `chat`) can start
   a thread with the freelancer (subject to platform rules). "Hire": link to invite-to-job /
   service request flow.

### Frontend
3. Render the **same** profile component as `slide-11` with `viewMode="public"`:
   - Swap action buttons to **توظيف المستقل** (opens invite-to-job / hire modal) and
     **مراسلة** (starts a conversation, gated by auth/sign-in).
   - Ensure the right rail (experiences/education/certs/tools) renders identically to self
     view — this directly addresses the deck note.
4. Add the reviews/«آراء العملاء» section under completed tasks.

## 5. Acceptance criteria
- Visitor profile is column-for-column identical to self view except CTAs.
- توظيف/مراسلة work (invite + start chat); no external contact rendered.
- Reviews show with aggregate rating.

## Dependencies
Shared component + serializer with `slide-11`. Chat app for messaging. Jobs/invitations for
hiring. Reviews app. Contact guard `slide-01`.
