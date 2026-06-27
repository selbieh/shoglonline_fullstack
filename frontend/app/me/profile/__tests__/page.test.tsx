import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ProfileEditPage from "@/app/me/profile/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/me/profile",
}));

const PROFILE = {
  bio_title: "مطوّر", overview: "نبذة", expertise_level: "expert", hourly_rate: "20",
  is_verified: false, completeness_pct: 60,
  skills: [{ skill_id: 1, name: "بايثون", efficiency: "advanced" }],
};

function base(idv: { status: string } = { status: "none" }) {
  server.use(
    http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ id: 1, email: "u@x.com", first_name: "سعيد", last_name: "ع", avatar_url: "", active_mode: "find_job", status: "active" })),
    http.get(`${API_URL}/me/profile`, () => HttpResponse.json(PROFILE)),
    http.get(`${API_URL}/skills`, () => HttpResponse.json([{ id: 1, name_ar: "بايثون" }, { id: 2, name_ar: "تصميم" }])),
    http.get(`${API_URL}/me/id-verification`, () => HttpResponse.json(idv)),
    http.get(`${API_URL}/categories`, () => HttpResponse.json([{ id: 1, name_ar: "برمجة" }, { id: 2, name_ar: "تصميم" }])),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ProfileEditPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<ProfileEditPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("renders profile fields + completeness + a skill", async () => {
    base();
    render(<ProfileEditPage />);
    expect(await screen.findByText("اكتمال الملف: 60%")).toBeInTheDocument();
    expect(screen.getByDisplayValue("مطوّر")).toBeInTheDocument();
    expect(screen.getByText(/بايثون/)).toBeInTheDocument();
  });

  it("saves scalar fields via PATCH /me/profile", async () => {
    base();
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${API_URL}/auth/me`, () => HttpResponse.json({})),
      http.patch(`${API_URL}/me/profile`, async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(PROFILE);
      }),
    );
    const { user } = render(<ProfileEditPage />);
    await user.click(await screen.findByText("حفظ"));
    await waitFor(() => expect(patched).toMatchObject({ bio_title: "مطوّر", expertise_level: "expert" }));
    expect(await screen.findByText("✅ حُفظ ملفك")).toBeInTheDocument();
  });

  // P1-06 (BUG-05): a transient failure on an OPTIONAL lookup (here /categories 500s) must NOT
  // eject the authenticated user to sign-in — the page still renders from the critical pair.
  it("stays on the page when an optional lookup (categories) fails", async () => {
    server.use(
      http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ id: 1, email: "u@x.com", first_name: "سعيد", last_name: "ع", avatar_url: "", active_mode: "find_job", status: "active" })),
      http.get(`${API_URL}/me/profile`, () => HttpResponse.json(PROFILE)),
      http.get(`${API_URL}/skills`, () => HttpResponse.json([{ id: 1, name_ar: "بايثون" }])),
      http.get(`${API_URL}/me/id-verification`, () => HttpResponse.json({ status: "none" })),
      http.get(`${API_URL}/categories`, () => HttpResponse.json({ message_ar: "خطأ" }, { status: 500 })),
    );
    render(<ProfileEditPage />);
    expect(await screen.findByText("اكتمال الملف: 60%")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  // P2-17: when /auth/me succeeds but /me/profile fails, the name/avatar IS saved — surface a
  // partial-success notice (not a blanket error implying nothing was saved).
  it("shows a partial-success notice when the profile write fails after the identity write", async () => {
    base();
    server.use(
      http.patch(`${API_URL}/auth/me`, () => HttpResponse.json({})),
      http.patch(`${API_URL}/me/profile`, () => HttpResponse.json({ message_ar: "خطأ بالخادم" }, { status: 500 })),
    );
    const { user } = render(<ProfileEditPage />);
    await user.click(await screen.findByText("حفظ"));
    expect(await screen.findByText(/حُفظ الاسم والصورة/)).toBeInTheDocument();
  });

  it("submits an uploaded national ID for verification", async () => {
    base({ status: "none" });
    server.use(
      http.post(`${API_URL}/uploads`, () =>
        HttpResponse.json({ id: 42, original_name: "id.png", content_type: "image/png", size: 9, kind: "image", url: "x", created_at: "x" }, { status: 201 })),
      http.post(`${API_URL}/me/id-verification`, () => HttpResponse.json({ status: "pending" })),
    );
    const { user } = render(<ProfileEditPage />);
    await screen.findByText("توثيق الهوية");
    // Target the national-ID uploader by its FileUpload dropzone aria-label (the page has several
    // uploaders — avatar/cover/portfolio/ID — so positional selection is brittle).
    const dropzone = screen.getByRole("button", { name: "ارفع صورة الهوية الوطنية" });
    const input = dropzone.parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(9)], "id.png", { type: "image/png" }));
    expect(await screen.findByText("✅ أُرسلت هويتك للمراجعة")).toBeInTheDocument();
  });
});
