import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import BidsPage from "@/app/bids/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/bids",
}));

const PLANS = [{ id: 3, name: "باقة ١٠", bids_count: 10, cost: "9.00", description: "للبداية" }];
const HISTORY = {
  balance: 4,
  summary: { granted: 10, purchased: 0, consumed: 6, refunded: 0, net: 4 },
  ledger: [{ id: 1, delta: 10, reason: "signup_grant", created_at: "2026-01-01" }],
};

function base() {
  server.use(
    http.get(`${API_URL}/bid-plans`, () => HttpResponse.json(PLANS)),
    http.get(`${API_URL}/me/bids/history`, () => HttpResponse.json(HISTORY)),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("BidsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<BidsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("renders balance, summary and a plan", async () => {
    base();
    render(<BidsPage />);
    expect(await screen.findByText("رصيد العروض")).toBeInTheDocument();
    expect(await screen.findByText("باقة ١٠")).toBeInTheDocument();
    expect(screen.getByText(/شراء بـ 9.00\$/)).toBeInTheDocument();
  });

  it("purchases a plan via the right endpoint and shows success", async () => {
    base();
    let purchased = false;
    server.use(
      http.post(`${API_URL}/bid-plans/3/purchase`, () => {
        purchased = true;
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );
    const { user } = render(<BidsPage />);
    await user.click(await screen.findByText(/شراء بـ/));
    await waitFor(() => expect(purchased).toBe(true));
    expect(await screen.findByText(/تم شراء/)).toBeInTheDocument();
  });

  it("shows a disabled state and loads no plans/history when bids are off", async () => {
    // no /bid-plans or /me/bids/history handlers — if the page loads them, the test fails
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
    );
    render(<BidsPage />);
    expect(await screen.findByText("نظام العروض معطّل حاليًا")).toBeInTheDocument();
    expect(screen.queryByText(/شراء بـ/)).not.toBeInTheDocument();
  });

  it("shows the Arabic error envelope when funds are insufficient", async () => {
    base();
    server.use(
      http.post(`${API_URL}/bid-plans/3/purchase`, () =>
        HttpResponse.json({ code: "insufficient_funds", message_ar: "الرصيد المتاح غير كافٍ — اشحن محفظتك" }, { status: 400 }),
      ),
    );
    const { user } = render(<BidsPage />);
    await user.click(await screen.findByText(/شراء بـ/));
    expect(await screen.findByText("الرصيد المتاح غير كافٍ — اشحن محفظتك")).toBeInTheDocument();
  });
});
