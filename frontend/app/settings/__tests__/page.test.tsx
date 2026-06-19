import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import SettingsPage from "@/app/settings/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings",
}));

const PREFS = { chat_unread: true, job_alerts: true, proposal_updates: true, marketing: true };

function base() {
  server.use(
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({
        id: 1, email: "u@x.com", email_verified: true, first_name: "سعيد", last_name: "",
        avatar_url: "", phone_verified: false, active_mode: "find_job", status: "active",
      }),
    ),
    http.get(`${API_URL}/me/notification-preferences`, () => HttpResponse.json(PREFS)),
    http.get(`${API_URL}/me/profile`, () => HttpResponse.json({ visibility: "online" })),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("SettingsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<SettingsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("renders prefs + visibility", async () => {
    base();
    render(<SettingsPage />);
    expect(await screen.findByText("تفضيلات الإشعارات")).toBeInTheDocument();
    expect(screen.getByLabelText("إعلانات وعروض المنصة")).toBeChecked();
  });

  it("PUTs a preference change", async () => {
    base();
    let putBody: Record<string, unknown> | null = null;
    server.use(http.put(`${API_URL}/me/notification-preferences`, async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...PREFS, marketing: false });
    }));
    const { user } = render(<SettingsPage />);
    await user.click(await screen.findByLabelText("إعلانات وعروض المنصة"));
    await waitFor(() => expect(putBody).toEqual({ marketing: false }));
  });

  it("shows BR-2 blockers when deletion is refused", async () => {
    base();
    server.use(http.delete(`${API_URL}/auth/me`, () =>
      HttpResponse.json(
        { code: "deletion_blocked", message_ar: "لا يمكن حذف الحساب الآن",
          blockers: [{ code: "wallet_not_empty", message_ar: "رصيد محفظتك غير صفري" }] },
        { status: 409 },
      ),
    ));
    const { user } = render(<SettingsPage />);
    await user.click(await screen.findByText("أريد حذف حسابي"));
    await user.click(screen.getByText("تأكيد الحذف النهائي"));
    expect(await screen.findByText("رصيد محفظتك غير صفري")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalledWith("/");
  });

  it("deletes the account on success and redirects home", async () => {
    base();
    server.use(http.delete(`${API_URL}/auth/me`, () => new HttpResponse(null, { status: 204 })));
    const { user } = render(<SettingsPage />);
    await user.click(await screen.findByText("أريد حذف حسابي"));
    await user.click(screen.getByText("تأكيد الحذف النهائي"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
  });
});
