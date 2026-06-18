import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import SubscriptionsPage from "@/app/subscriptions/page";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/subscriptions",
}));

const CATS = [
  { id: 1, name_ar: "برمجة", slug: "dev", icon: "💻", children: [] },
  { id: 2, name_ar: "تصميم", slug: "design", icon: "🎨", children: [] },
];

function base(subs: unknown[] = []) {
  server.use(
    http.get(`${API_URL}/categories`, () => HttpResponse.json(CATS)),
    http.get(`${API_URL}/me/category-subscriptions`, () => HttpResponse.json(subs)),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("SubscriptionsPage", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<SubscriptionsPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("reflects current subscriptions as checked", async () => {
    base([{ id: 9, category: 1, category_name: "برمجة", subcategory: null }]);
    render(<SubscriptionsPage />);
    expect(await screen.findByLabelText("برمجة")).toBeChecked();
    expect(screen.getByLabelText("تصميم")).not.toBeChecked();
  });

  it("PUTs the full set when toggling a category", async () => {
    base([]);
    let body: unknown = null;
    server.use(http.put(`${API_URL}/me/category-subscriptions`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json([]);
    }));
    const { user } = render(<SubscriptionsPage />);
    await user.click(await screen.findByLabelText("تصميم"));
    await waitFor(() => expect(body).toEqual([{ category: 2, subcategory: null }]));
    expect(await screen.findByText("✅ حُفظت اشتراكاتك")).toBeInTheDocument();
  });
});
