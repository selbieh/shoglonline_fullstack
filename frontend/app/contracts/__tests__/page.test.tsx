import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ContractsPage from "@/app/contracts/page";

// useRouter must return a STABLE object — the real Next router is memoized, and the page's
// load() effect depends on it; a fresh object per render would re-run the effect forever.
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
const params = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => params,
  usePathname: () => "/contracts",
}));

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ContractsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<ContractsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(nav.replace.mock.calls[0][0]).toMatch(/^\/signin/);
  });

  // P2-29 (BUG-05): a transient 500 must NOT eject an authenticated user to sign-in.
  it("shows an in-page retry on a 500 instead of bouncing to sign-in", async () => {
    server.use(http.get(`${API_URL}/me/contracts`, () => new HttpResponse(null, { status: 500 })));
    render(<ContractsPage />);
    expect(await screen.findByText("تعذّر تحميل العقود")).toBeInTheDocument();
    expect(screen.getByText("إعادة المحاولة")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
