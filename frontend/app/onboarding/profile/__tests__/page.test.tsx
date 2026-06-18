import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ProfileWizard from "@/app/onboarding/profile/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/onboarding/profile",
}));

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ProfileWizard", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<ProfileWizard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("steps through and saves the draft via PATCH /me/profile", async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(http.patch(`${API_URL}/me/profile`, async ({ request }) => {
      patched = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({});
    }));
    const { user } = render(<ProfileWizard />);

    expect(screen.getByText("خطوة 1 من 3")).toBeInTheDocument();
    await user.click(screen.getByText("خبير"));
    await user.click(screen.getByText("التالي")); // → step 2
    await user.type(screen.getByLabelText("سعر الساعة"), "25");
    await user.click(screen.getByText("التالي")); // → step 3
    await user.type(screen.getByLabelText("المسمى المهني"), "مصمم");
    await user.click(screen.getByText("إنهاء"));

    await waitFor(() => expect(patched).toMatchObject({ expertise_level: "expert", hourly_rate: "25", bio_title: "مصمم" }));
    expect(nav.push).toHaveBeenCalledWith("/me/profile");
  });

  it("supports going back a step", async () => {
    const { user } = render(<ProfileWizard />);
    await user.click(screen.getByText("التالي"));
    expect(screen.getByText("خطوة 2 من 3")).toBeInTheDocument();
    await user.click(screen.getByText("رجوع"));
    expect(screen.getByText("خطوة 1 من 3")).toBeInTheDocument();
  });
});
