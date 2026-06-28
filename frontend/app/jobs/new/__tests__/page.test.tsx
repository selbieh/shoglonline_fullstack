import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import NewJobPage from "@/app/jobs/new/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  localStorage.setItem("sh_access", "tok");
  server.use(
    http.get(`${API_URL}/categories`, () => HttpResponse.json([])),
    http.get(`${API_URL}/skills`, () => HttpResponse.json([])),
  );
});

describe("NewJobPage — submit-failure focus management (P2-35)", () => {
  it("turns the error banner into a focused live region on validation failure", async () => {
    const { user } = render(<NewJobPage />);

    // Submit the empty form → client-side validation fails.
    await user.click(await screen.findByRole("button", { name: /نشر الوظيفة/ }));

    // The per-field <Field> error notes also carry role="alert", so target the banner by its text.
    const banner = await screen.findByText(/يرجى تصحيح الحقول/);
    // Focus is moved to the banner so keyboard/AT users land on the error.
    await waitFor(() => expect(banner).toHaveFocus());
  });
});

describe("NewJobPage — hire a specific freelancer (FR-JOB-12)", () => {
  beforeEach(() => {
    nav.search = "hire=42";
    server.use(
      http.get(`${API_URL}/freelancers/42`, () => HttpResponse.json({ id: 42, name: "سارة" })),
      http.get(`${API_URL}/categories`, () =>
        HttpResponse.json([{ id: 1, name_ar: "برمجة", icon: "", children: [] }])),
    );
  });

  it("shows a private-invite banner naming the freelancer", async () => {
    render(<NewJobPage />);
    expect(await screen.findByText(/سارة/)).toBeInTheDocument();
    expect(screen.getByText(/خاصة/)).toBeInTheDocument();
  });

  it("sends invited_worker_id so the backend posts the job privately", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(http.post(`${API_URL}/me/jobs`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ status: "published", slug: "job-1" });
    }));
    const { user } = render(<NewJobPage />);

    await user.type(await screen.findByRole("textbox", { name: /عنوان الوظيفة/ }), "تصميم شعار");
    await user.type(screen.getByRole("textbox", { name: /وصف الوظيفة/ }), "وصف كافٍ للوظيفة");
    // category is a <select> rendered with the seeded option list — pick the first real category
    await user.selectOptions(screen.getByRole("combobox"), screen.getAllByRole("option")[1]);
    const [min, max] = screen.getAllByRole("textbox").filter((el) => (el as HTMLInputElement).inputMode === "numeric");
    await user.type(min, "100");
    await user.type(max, "200");
    await user.click(screen.getByRole("button", { name: /إرسال الدعوة/ }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.invited_worker_id).toBe(42);
  });
});
