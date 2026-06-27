import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import PayoutsPage from "@/app/settings/payouts/page";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/payouts",
}));

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
  server.use(http.get(`${API_URL}/me/payout-methods`, () => HttpResponse.json([])));
});

describe("PayoutsPage", () => {
  // P1-05: a field-keyed validation_error must highlight the offending input,
  // not be collapsed to the generic banner.
  it("maps a backend field error onto the keyed PayPal input", async () => {
    server.use(
      http.post(`${API_URL}/me/payout-methods`, () =>
        HttpResponse.json(
          { code: "validation_error", message_ar: "تحقّق من الحقول", fields: { paypal_email: ["بريد غير صالح"] } },
          { status: 400 },
        )),
    );
    const { user } = render(<PayoutsPage />);
    await user.click(await screen.findByText("PayPal"));
    await user.type(screen.getByLabelText("البريد الإلكتروني لـ PayPal"), "bad@x");
    await user.click(screen.getByText("حفظ الوسيلة"));
    // The per-field message renders (via <Field role="alert">), proving the field key was preserved.
    expect(await screen.findByText("بريد غير صالح")).toBeInTheDocument();
  });

  // P2-11: detail values must be trimmed before POST (the enable-guard already trims).
  it("trims detail values before POSTing", async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_URL}/me/payout-methods`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, kind: "paypal", label: "", country: "", details: {}, is_default: true }, { status: 201 });
      }),
    );
    const { user } = render(<PayoutsPage />);
    await user.click(await screen.findByText("PayPal"));
    await user.type(screen.getByLabelText("البريد الإلكتروني لـ PayPal"), "  me@x.com  ");
    await user.click(screen.getByText("حفظ الوسيلة"));
    await waitFor(() => expect(posted).not.toBeNull());
    expect((posted as unknown as { details: Record<string, string> }).details.paypal_email).toBe("me@x.com");
  });
});
