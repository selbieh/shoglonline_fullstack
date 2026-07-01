import { describe, expect, it, vi } from "vitest";

import { render } from "@/test/utils/render";

import BuyBox, { type ServiceLite } from "@/app/services/[slug]/BuyBox";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const service: ServiceLite = {
  id: 1,
  base_price: "100",
  addons: [{ id: 7, title: "تسليم سريع", price: "20", extra_days: 1 }],
  worker: 42,
};

describe("<BuyBox>", () => {
  it("uses a logical RTL margin (me-2) on the add-on checkbox, not physical ml-2", () => {
    const { container } = render(<BuyBox service={service} />);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toHaveClass("me-2");
    expect(checkbox).not.toHaveClass("ml-2");
  });
});
