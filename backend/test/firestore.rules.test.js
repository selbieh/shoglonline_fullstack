/**
 * Firestore security-rules tests (SEC-3 / AC-13) — run against the Firebase emulator.
 *
 * Asserts the four guarantees the chat control plane relies on:
 *   1. a user reads ONLY conversations they participate in (cross-user read denied),
 *   2. sender-only message writes,
 *   3. a `read_only` conversation rejects new messages,
 *   4. clients can NEVER create/rename a conversation (only the backend Admin SDK does).
 *
 * Setup (not run in the Python/CI suite by default):
 *   npm i -D @firebase/rules-unit-testing firebase
 *   firebase emulators:exec --only firestore "npx mocha backend/test/firestore.rules.test.js"
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");

let testEnv;

const A = "1"; // participant uids are STRINGS (= Django user id), matching mint_custom_token
const B = "2";
const OUTSIDER = "3";

async function seedConversation(id, { status = "active" } = {}) {
  // backend (Admin SDK) writes conversation docs — rules are bypassed for this setup write
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`conversations/${id}`).set({
      participants: [A, B],
      names: { [A]: "أ", [B]: "ب" },
      status,
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "shoghl-rules-test",
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8") },
  });
});

beforeEach(() => testEnv.clearFirestore());
after(() => testEnv.cleanup());

describe("conversation reads", () => {
  it("a participant can read the conversation", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(A).firestore();
    await assertSucceeds(db.doc("conversations/c1").get());
  });

  it("a non-participant cannot read the conversation", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(OUTSIDER).firestore();
    await assertFails(db.doc("conversations/c1").get());
  });
});

describe("message writes", () => {
  it("the sender can write into an active conversation", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(A).firestore();
    await assertSucceeds(
      db.collection("conversations/c1/messages").add({ sender: A, body: "hi", files: [] }),
    );
  });

  it("a participant cannot forge another user's message (sender-only)", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(A).firestore();
    await assertFails(
      db.collection("conversations/c1/messages").add({ sender: B, body: "spoofed", files: [] }),
    );
  });

  it("an outsider cannot write a message", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(OUTSIDER).firestore();
    await assertFails(
      db.collection("conversations/c1/messages").add({ sender: OUTSIDER, body: "x", files: [] }),
    );
  });

  it("a read_only conversation rejects new messages", async () => {
    await seedConversation("c1", { status: "read_only" });
    const db = testEnv.authenticatedContext(A).firestore();
    await assertFails(
      db.collection("conversations/c1/messages").add({ sender: A, body: "late", files: [] }),
    );
  });

  it("rejects an over-shaped payload (extra fields)", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(A).firestore();
    await assertFails(
      db.collection("conversations/c1/messages").add({ sender: A, body: "x", files: [], evil: true }),
    );
  });
});

describe("conversation creation", () => {
  it("a client cannot create a conversation", async () => {
    const db = testEnv.authenticatedContext(A).firestore();
    await assertFails(
      db.doc("conversations/new1").set({ participants: [A, B], status: "active" }),
    );
  });

  it("a client cannot rename/relabel an existing conversation", async () => {
    await seedConversation("c1");
    const db = testEnv.authenticatedContext(A).firestore();
    await assertFails(db.doc("conversations/c1").update({ names: { [A]: "hacked" } }));
  });
});

// keep `assert` referenced for linters even though we rely on assertFails/assertSucceeds
assert.ok(true);
