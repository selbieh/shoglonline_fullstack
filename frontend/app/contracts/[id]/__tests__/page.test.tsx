import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ContractDetailPage from "@/app/contracts/[id]/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/contracts/7",
}));

const CONTRACT = {
  id: 7, title: "تصميم شعار", scope: "شعار احترافي", budget: "100.00", status: "active",
  deadline: null, my_role: "worker", counterpart: { id: 2, name: "صاحب العمل", email: "e@x.com" },
  commission_pct: "10", commission_amount: "10.00", worker_earning: "90.00",
  funding_deadline: null, warranty_ends_at: null, resolution_note: "", cancel_reason: "",
  cancel_requested_by_me: false, cancel_pending: false,
  submissions: [], update_requests: [], events: [],
};

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ContractDetailPage", () => {
  // P2-31 (BUG-05): a transient 500 must show an in-place retry, NOT silently redirect to /contracts.
  it("shows an in-place retry on a 500 instead of redirecting to /contracts", async () => {
    server.use(http.get(`${API_URL}/contracts/7`, () => new HttpResponse(null, { status: 500 })));
    render(<ContractDetailPage />);
    expect(await screen.findByText("تعذّر تحميل العقد")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("redirects to /contracts on a 404", async () => {
    server.use(http.get(`${API_URL}/contracts/7`, () => new HttpResponse(null, { status: 404 })));
    render(<ContractDetailPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/contracts"));
  });

  // P2-15: a typed non-positive budget must NOT be submittable (button disabled, no POST fired).
  it("blocks an update request with a non-positive budget", async () => {
    let posted = false;
    server.use(
      http.get(`${API_URL}/contracts/7`, () => HttpResponse.json(CONTRACT)),
      http.post(`${API_URL}/contracts/7/update-requests`, () => {
        posted = true;
        return HttpResponse.json(CONTRACT);
      }),
    );
    const { user } = render(<ContractDetailPage />);
    const input = await screen.findByPlaceholderText("ميزانية جديدة (بالدولار الأمريكي)");
    // a positive budget enables the submit button…
    await user.type(input, "150");
    const submit = screen.getByText("إرسال الطلب");
    expect(submit).toBeEnabled();
    // …but clearing it to zero disables it again (positive-number guard).
    await user.clear(input);
    await user.type(input, "0");
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(posted).toBe(false);
  });
});
