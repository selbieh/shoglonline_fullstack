import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import NotificationsPage from "@/app/notifications/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/notifications",
}));

const NOTES = [
  { id: 1, kind: "contract", title: "تحديث عقد", body: "نص", deep_link: "/contracts/5", is_read: false, created_at: "2026-01-01" },
  { id: 2, kind: "chat_message", title: "رسالة", body: "", deep_link: "", is_read: true, created_at: "2026-01-01" },
];

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
  server.use(http.get(`${API_URL}/me/notifications`, () => HttpResponse.json({ results: NOTES })));
});

describe("NotificationsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    server.use(http.get(`${API_URL}/me/notifications`, () => new HttpResponse(null, { status: 401 })));
    render(<NotificationsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("lists notifications", async () => {
    render(<NotificationsPage />);
    expect(await screen.findByText("تحديث عقد")).toBeInTheDocument();
    expect(screen.getByText("رسالة")).toBeInTheDocument();
  });

  it("marks one read then navigates to its deep link", async () => {
    let marked = false;
    server.use(http.post(`${API_URL}/notifications/1/read`, () => { marked = true; return HttpResponse.json({ id: 1, is_read: true }); }));
    const { user } = render(<NotificationsPage />);
    await user.click(await screen.findByText("تحديث عقد"));
    await waitFor(() => expect(marked).toBe(true));
    expect(nav.push).toHaveBeenCalledWith("/contracts/5");
  });

  it("marks all read", async () => {
    let all = false;
    server.use(http.post(`${API_URL}/me/notifications/read-all`, () => { all = true; return HttpResponse.json({ unread: 0 }); }));
    const { user } = render(<NotificationsPage />);
    await user.click(await screen.findByText("تعليم الكل كمقروء"));
    await waitFor(() => expect(all).toBe(true));
  });
});
