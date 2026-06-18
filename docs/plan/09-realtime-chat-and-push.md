# PART 09 — Real-time Chat & Push (Firebase)

**Goal:** replace the chat **polling** stub with real Firebase/Firestore + FCM, keeping
PostgreSQL the source of truth (mirror metadata only). The unread-email fallback + read-only
lifecycle already exist server-side — this part wires the live transport + rules + push.
**Depends on:** Parts 01–02 (chat tests), Part 03 (chat attachments/audio).
**SRS refs:** FR-CHAT-1/4/5, FR-NOT-2, §14, AC-6, BR-10/12, SEC-3. **Reference:** GAP Phase 15.
**Flags:** `chat.enabled` (exists — kill-switch must still hide everything).
**Effort:** L

## Steps

### Backend
1. [ ] Add `firebase-admin` (+ `google-cloud-firestore`) to requirements; provision a Firebase project + service-account creds (env, never committed). Keep `FIRESTORE_STUB`/`FCM_STUB` for dev/test.
2. [ ] **Backend-minted custom tokens**: `POST /chat/token` issues a Firebase custom token scoped to the user (Google tokens never reused as session creds — FR-AUTH-3 analogue). Clients sign into Firebase with it.
3. [ ] Flip `apps/chat/firestore.py` from stub to real: `mirror_conversation/mirror_message/mirror_status` write to Firestore; PG stores metadata (read flags, snippet) for unread-email + oversight + search (the "mirror", glossary).
4. [ ] **FCM device tokens**: `DeviceToken` model + register/unregister endpoints; flip `notifications/push.send_push` to real FCM HTTP v1 for chat/proposal/contract/payment/ticket/broadcast events (FR-NOT-2).
5. [ ] Delivery state sent/delivered/read on messages (FR-CHAT-5) — extend the read-cursor model with a delivered signal synced from the client.

### Firestore security rules (SEC-3 / AC-13)
6. [ ] Author rules: a user reads only conversations they're a member of; **sender-only writes**; `read_only` conversations reject sends; **client cannot create conversations** (only the backend does). Deploy rules per environment.

### Frontend
7. [ ] Add the Firebase web SDK; on chat open, fetch a custom token, sign in, attach a **real-time listener** (replace the 8s polling in `app/messages/[id]`). Optimistic send → Firestore write → backend mirror.
8. [ ] Register the FCM service worker + request web-push permission; render in-app + push notifications; graceful degradation where web push is unavailable (iOS) → in-app + email fallback (already built).
9. [ ] Chat composer: emoji, file attachments (Part 03), **recorded audio** (MediaRecorder), read receipts, delivery ticks.

## Tests to add
- **Firestore rules unit tests** (Firebase emulator, CI): cross-user read denied; sender-only write; `read_only` blocks sends; client conversation-create denied. (**AC-13**)
- Backend: `POST /chat/token` scopes to the requester; `send_message` calls the real mirror when stub off (assert adapter args via `responses`/mocker); warranty-end flips `read_only` in PG **and** Firestore (assert `mirror_status`).
- Frontend: chat thread test — listener renders incoming message; composer disabled on read-only/kill-switch; audio record control present.
- E2E (Part 11) `chat.spec.ts`: two parties exchange a message **≤2s p95**, unread badge, warranty-end read-only.

## Exit criteria (maps **AC-6**)
- [ ] Real-time both directions ≤2s; files/emoji/audio send + render; read receipts; FCM push received on web.
- [ ] 10-minute unread email still fires exactly once with a working deep link (unchanged); `chat.enabled` OFF kills chat everywhere; warranty-end flips read-only in both stores.
- [ ] Firestore rules unit tests green (cross-user denied, sender-only, no client conversation create).
