# Real-time chat — Firestore data plane + backend control plane

Chat's **heavy load lives in Firestore** (messages, real-time connections); the **backend stays
the control plane** (decides who may chat, owns conversation status, mints each user's identity).
This is the architecture behind Part 09, built with the "full client-side Firestore" write model.

## How it splits

| Concern | Where | Code |
|---|---|---|
| *Who can chat with whom* (BR-11) | **Backend** — creates the conversation doc | `apps/chat/services.py` → `firestore.mirror_conversation` |
| User identity in Firestore | **Backend** — mints a custom token (uid = Django id) | `POST /chat/token` → `apps/chat/firebase.py` |
| Conversation status (active / read-only, BR-10) | **Backend** — writes `status` to the doc | `services.set_read_only` → `firestore.mirror_status` |
| Message reads + real-time listeners | **Firestore** (clients subscribe directly) | `frontend/lib/firebaseChat.ts` |
| Message writes | **Firestore** (clients write directly) | `sendViaFirestore` |
| Access enforcement | **Firestore security rules** (the backend's control, declarative) | `backend/firestore.rules` |
| Oversight / unread-email mirror | **Backend** — Cloud Function syncs each message to Postgres | `POST /chat/sync` → `services.persist_synced_message` |

Clients never create or rename conversations and can't read others' threads — `firestore.rules`
forbids it; only the Admin SDK (backend) writes conversation docs.

## Provisioning (production)

1. Create a Firebase project; enable **Firestore** and **Authentication → Custom tokens**.
2. Generate a service-account key. Set backend env:
   ```
   FIRESTORE_STUB=0
   FIREBASE_PROJECT_ID=<project-id>
   FIREBASE_CREDENTIALS=<path to service-account.json OR the JSON inline>
   FIREBASE_WEB_API_KEY=<public web api key>     # exposed to the browser by /chat/token
   CHAT_SYNC_SECRET=<random secret>              # guards POST /chat/sync
   ```
3. Deploy the rules: `firebase deploy --only firestore:rules` (source: `backend/firestore.rules`).
4. Deploy the **sync Cloud Function** (skeleton below). It mirrors each client-written message
   back to Postgres so the 10-minute unread-email job, search, and dispute oversight keep working.

### Sync Cloud Function (skeleton)

```js
// Firestore trigger: conversations/{convId}/messages/{msgId} onCreate
exports.syncMessageToBackend = functions.firestore
  .document("conversations/{convId}/messages/{msgId}")
  .onCreate(async (snap, ctx) => {
    const m = snap.data();
    await fetch(`${BACKEND_URL}/api/v1/chat/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Chat-Sync-Secret": CHAT_SYNC_SECRET },
      body: JSON.stringify({
        conversation_id: Number(ctx.params.convId),
        sender_id: Number(m.sender),
        body: m.body || "",
        files: m.files || [],
        firestore_id: ctx.params.msgId,   // dedupes retries (idempotent on the backend)
      }),
    });
  });
```

`POST /chat/sync` is idempotent on `firestore_id`, so Cloud Function retries never double-persist.

## Dev / test

`FIRESTORE_STUB=1` (default) keeps everything in Postgres + the REST polling fallback — no Firebase
needed. `/chat/token` returns `{ stub: true }`, and `frontend/lib/firebaseChat.ts` degrades to the
REST path automatically. Backend tests run in stub mode and mock the Admin SDK for the real paths.

## Rules tests (CI)

Run `firestore.rules` against the Firebase emulator to assert (AC-13): cross-user read denied,
sender-only writes, `read_only` blocks sends, client conversation-create denied.
