import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import MyJobsPage from "@/app/me/jobs/page";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/me/jobs",
}));

const JOBS = [{ id: 5, title: "تطوير موقع", slug: "site", status: "closed", budget_min: "100", budget_max: "500", proposals_count: 3 }];
const CONTRACTS = [
  { id: 1, status: "completed", my_role: "employer", counterpart: { id: 9, name: "سعيد" } },
  { id: 2, status: "active", my_role: "employer", counterpart: { id: 10, name: "آخر" } },
];

function base() {
  server.use(
    http.get(`${API_URL}/me/jobs`, () => HttpResponse.json({ results: JOBS })),
    http.get(`${API_URL}/me/contracts`, () => HttpResponse.json({ results: CONTRACTS })),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("MyJobsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<MyJobsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("lists jobs and only COMPLETED-contract workers are rehireable", async () => {
    base();
    render(<MyJobsPage />);
    expect(await screen.findByText("تطوير موقع")).toBeInTheDocument();
    expect(await screen.findByText("إعادة توظيف سعيد")).toBeInTheDocument(); // completed
    expect(screen.queryByText("إعادة توظيف آخر")).not.toBeInTheDocument(); // active → not offered
  });

  it("reposts a job to the right endpoint with edited fields", async () => {
    base();
    let body: Record<string, unknown> | null = null;
    server.use(http.post(`${API_URL}/me/jobs/5/repost`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 6 }, { status: 201 });
    }));
    const { user } = render(<MyJobsPage />);
    await user.click(await screen.findByText("إعادة نشر"));
    await user.click(screen.getByText("إعادة النشر"));
    await waitFor(() => expect(body).toMatchObject({ title: "تطوير موقع", visibility: "public" }));
    expect(await screen.findByText("✅ أُعيد نشر الوظيفة")).toBeInTheDocument();
  });

  it("rehires a past worker via /me/rehire", async () => {
    base();
    let rehired: number | null = null;
    server.use(http.post(`${API_URL}/me/rehire`, async ({ request }) => {
      rehired = ((await request.json()) as { worker_id: number }).worker_id;
      return HttpResponse.json({ id: 7 }, { status: 201 });
    }));
    const { user } = render(<MyJobsPage />);
    await user.click(await screen.findByText("إعادة توظيف سعيد"));
    await waitFor(() => expect(rehired).toBe(9));
    expect(await screen.findByText(/أُنشئت وظيفة خاصة/)).toBeInTheDocument();
  });

  it("surfaces the Arabic error envelope on rehire failure", async () => {
    base();
    server.use(http.post(`${API_URL}/me/rehire`, () =>
      HttpResponse.json({ code: "no_prior_engagement", message_ar: "لا يوجد تعاقد سابق مكتمل مع هذا المستقل" }, { status: 400 }),
    ));
    const { user } = render(<MyJobsPage />);
    await user.click(await screen.findByText("إعادة توظيف سعيد"));
    expect(await screen.findByText("لا يوجد تعاقد سابق مكتمل مع هذا المستقل")).toBeInTheDocument();
  });
});
