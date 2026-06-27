import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ModeSelect from "@/app/onboarding/mode/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/onboarding/mode",
}));

beforeEach(() => {
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ModeSelect", () => {
  it("navigates to the wizard on success", async () => {
    server.use(http.patch(`${API_URL}/auth/me/mode`, () => HttpResponse.json({ ok: true })));
    const { user } = render(<ModeSelect />);
    await user.click(await screen.findByText("أبحث عن عمل"));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/onboarding/profile"));
  });

  it("surfaces an Arabic error and re-enables the cards on a non-401 failure", async () => {
    server.use(
      http.patch(`${API_URL}/auth/me/mode`, () =>
        HttpResponse.json({ code: "server_error", message_ar: "تعذّر حفظ الاختيار — حاول مجددًا" }, { status: 500 }),
      ),
    );
    const { user } = render(<ModeSelect />);
    const findJob = await screen.findByText("أبحث عن عمل");
    await user.click(findJob);

    // error is shown near the cards
    expect(await screen.findByText("تعذّر حفظ الاختيار — حاول مجددًا")).toBeInTheDocument();
    // no navigation happened
    expect(nav.push).not.toHaveBeenCalled();
    // busy was reset in finally → cards are interactive again (not stuck disabled)
    await waitFor(() => expect(findJob.closest("button")).not.toBeDisabled());
  });
});
