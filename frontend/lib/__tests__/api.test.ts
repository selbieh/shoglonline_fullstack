import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { api, tokens, API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";

afterEach(() => tokens.clear());

describe("api() client", () => {
  it("attaches the Bearer access token", async () => {
    tokens.set("acc-1", "ref-1");
    let seenAuth: string | null = null;
    server.use(
      http.get(`${API_URL}/me`, ({ request }) => {
        seenAuth = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    await api("/me");
    expect(seenAuth).toBe("Bearer acc-1");
  });

  it("on 401 refreshes once then retries with the new token", async () => {
    tokens.set("stale", "ref-1");
    let protectedCalls = 0;
    let refreshed = false;
    server.use(
      http.get(`${API_URL}/protected`, ({ request }) => {
        protectedCalls += 1;
        if (protectedCalls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ auth: request.headers.get("authorization") });
      }),
      http.post(`${API_URL}/auth/refresh`, () => {
        refreshed = true;
        return HttpResponse.json({ access: "fresh", refresh: "ref-2" });
      }),
    );

    const data = await api<{ auth: string }>("/protected");
    expect(refreshed).toBe(true);
    expect(protectedCalls).toBe(2);
    expect(data.auth).toBe("Bearer fresh");
    expect(tokens.access).toBe("fresh");
  });

  it("coalesces concurrent 401s into a single refresh (rotation-safe)", async () => {
    // Regression: the backend rotates + blacklists refresh tokens, so N parallel refreshes would
    // invalidate each other and bounce the user to sign-in. Concurrent 401s must share one refresh.
    tokens.set("stale", "ref-1");
    let refreshCalls = 0;
    server.use(
      http.get(`${API_URL}/p`, ({ request }) =>
        request.headers.get("authorization") === "Bearer stale"
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ ok: true }),
      ),
      http.post(`${API_URL}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ access: "fresh", refresh: "ref-2" });
      }),
    );

    await Promise.all([api("/p"), api("/p"), api("/p")]);
    expect(refreshCalls).toBe(1);
    expect(tokens.access).toBe("fresh");
  });

  it("throws an error carrying status + parsed body envelope", async () => {
    server.use(
      http.get(`${API_URL}/bad`, () =>
        HttpResponse.json({ detail: "غير مسموح" }, { status: 400 }),
      ),
    );

    await expect(api("/bad")).rejects.toMatchObject({
      status: 400,
      body: { detail: "غير مسموح" },
    });
  });

  it("returns undefined for 204 No Content", async () => {
    server.use(http.delete(`${API_URL}/thing/1`, () => new HttpResponse(null, { status: 204 })));

    const result = await api("/thing/1", { method: "DELETE" });
    expect(result).toBeUndefined();
  });
});
