import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import PaymentMethods from "@/components/PaymentMethods";

const METHODS = [
  { id: 1, type: "paypal", provider: "paypal", brand: "", last4: "", label: "me@x.com", is_default: true },
  { id: 2, type: "card", provider: "stripe", brand: "visa", last4: "4242", label: "", is_default: false },
];

beforeEach(() => {
  localStorage.setItem("sh_access", "tok");
  server.use(http.get(`${API_URL}/me/payment-methods`, () => HttpResponse.json(METHODS)));
});

describe("<PaymentMethods>", () => {
  it("lists saved methods masked + default badge, and never shows a PAN field", async () => {
    const { container } = render(<PaymentMethods />);
    expect(await screen.findByText(/me@x.com/)).toBeInTheDocument();
    expect(screen.getByText(/visa ••••4242/)).toBeInTheDocument();
    expect(screen.getByText("افتراضي")).toBeInTheDocument();
    // PCI: there is no raw card-number input anywhere in the control
    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs.some((i) => /card|number|pan/i.test(i.getAttribute("placeholder") || ""))).toBe(false);
  });

  it("links PayPal by posting a gateway token (not a PAN)", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(http.post(`${API_URL}/me/payment-methods`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 3 }, { status: 201 });
    }));
    const { user } = render(<PaymentMethods />);
    await user.click(await screen.findByText("ربط PayPal"));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.type).toBe("paypal");
    expect(String(body!.gateway_token)).toMatch(/^vault-/);
    expect(body).not.toHaveProperty("card_number");
  });

  it("deletes a method", async () => {
    let deleted = 0;
    server.use(http.delete(`${API_URL}/me/payment-methods/2`, () => { deleted = 2; return new HttpResponse(null, { status: 204 }); }));
    const { user } = render(<PaymentMethods />);
    const rows = await screen.findAllByText("حذف");
    await user.click(rows[1]);
    await waitFor(() => expect(deleted).toBe(2));
  });
});
