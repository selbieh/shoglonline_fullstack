import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import Dashboard from "@/app/dashboard/page";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));

function meHandler(mode: string) {
  return http.get(`${API_URL}/auth/me`, () =>
    HttpResponse.json({ id: 1, email: "u@x.com", first_name: "سعيد", last_name: "", avatar_url: "", active_mode: mode, status: "active" }),
  );
}

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("Dashboard", () => {
  it("redirects to /signin when there is no token", async () => {
    localStorage.clear();
    render(<Dashboard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("redirects to mode selection when the user has no active mode", async () => {
    server.use(meHandler(""));
    render(<Dashboard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding/mode"));
  });

  it("renders real worker KPIs (bids balance + available)", async () => {
    server.use(
      meHandler("find_job"),
      http.get(`${API_URL}/me/wallet`, () =>
        HttpResponse.json({ available: "70.00", escrow_held: "0.00", earnings_pending: "30.00" })),
      http.get(`${API_URL}/me/bids`, () => HttpResponse.json({ balance: 8, ledger: [] })),
      http.get(`${API_URL}/me/contracts`, () => HttpResponse.json({ count: 2, results: [] })),
    );
    render(<Dashboard />);
    // "رصيد العروض" appears as both the KPI and the quick-link, so match at least one
    expect((await screen.findAllByText("رصيد العروض")).length).toBeGreaterThan(0);
    expect(await screen.findByText("8")).toBeInTheDocument(); // bids balance
    expect(screen.getByText("70.00$")).toBeInTheDocument(); // available
  });

  it("hides the bid KPI and quick-link when bids are disabled", async () => {
    // deliberately NO /me/bids handler — if the dashboard still fetches it the test fails
    server.use(
      meHandler("find_job"),
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
      http.get(`${API_URL}/me/wallet`, () =>
        HttpResponse.json({ available: "70.00", escrow_held: "0.00", earnings_pending: "30.00" })),
      http.get(`${API_URL}/me/contracts`, () => HttpResponse.json({ count: 2, results: [] })),
    );
    render(<Dashboard />);
    // "عقودي كمستقل" appears as both the KPI and the quick-link — at least one confirms render
    expect((await screen.findAllByText("عقودي كمستقل")).length).toBeGreaterThan(0); // dashboard rendered
    expect(screen.queryByText("رصيد العروض")).not.toBeInTheDocument(); // no bid KPI nor quick-link
  });

  it("renders employer KPIs (jobs + escrow)", async () => {
    server.use(
      meHandler("find_worker"),
      http.get(`${API_URL}/me/wallet`, () =>
        HttpResponse.json({ available: "10.00", escrow_held: "100.00", earnings_pending: "0.00" })),
      http.get(`${API_URL}/me/jobs`, () => HttpResponse.json({ count: 3, results: [] })),
      http.get(`${API_URL}/me/contracts`, () => HttpResponse.json({ count: 1, results: [] })),
    );
    render(<Dashboard />);
    expect(await screen.findByText("وظائفي")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("100.00$")).toBeInTheDocument(); // escrow held
  });
});
