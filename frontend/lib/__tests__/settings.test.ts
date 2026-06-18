import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";

// resetPublicSettingsCache() runs in the global afterEach, so each test starts cache-free.

describe("public settings", () => {
  it("fetches flags and serves repeat calls from cache (one network hit)", async () => {
    let calls = 0;
    server.use(
      http.get(`${API_URL}/settings/public`, () => {
        calls += 1;
        return HttpResponse.json({ "bids.enabled": false });
      }),
    );

    const a = await fetchPublicSettings();
    const b = await fetchPublicSettings();

    expect(bidsEnabled(a)).toBe(false);
    expect(bidsEnabled(b)).toBe(false);
    expect(calls).toBe(1); // second call hit the TTL cache
  });

  it("fails open (bids enabled) when the endpoint errors", async () => {
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    const s = await fetchPublicSettings();
    expect(bidsEnabled(s)).toBe(true); // missing flag → default-on, never blocks a feature
  });

  it("treats only an explicit false as disabled", () => {
    expect(bidsEnabled({})).toBe(true);
    expect(bidsEnabled({ "bids.enabled": true })).toBe(true);
    expect(bidsEnabled({ "bids.enabled": false })).toBe(false);
  });
});
