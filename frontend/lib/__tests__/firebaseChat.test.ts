import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_URL } from "@/lib/api";
import { isRealtime, sendViaFirestore, subscribeToMessages } from "@/lib/firebaseChat";
import { server } from "@/test/msw/server";

// When the backend runs with FIRESTORE_STUB (dev), /chat/token reports stub:true and the
// client must degrade to the REST/polling path rather than touching Firebase.
describe("firebaseChat dev fallback", () => {
  it("reports not-realtime and no-ops when the backend is stubbed", async () => {
    server.use(
      http.post(`${API_URL}/chat/token`, () =>
        HttpResponse.json({ token: "stub-firebase-token:1", projectId: "", apiKey: "", stub: true }),
      ),
    );

    expect(await isRealtime()).toBe(false);
    expect(await subscribeToMessages(1, () => {})).toBeNull();
    expect(await sendViaFirestore(1, "hi")).toBe(false);
  });
});
