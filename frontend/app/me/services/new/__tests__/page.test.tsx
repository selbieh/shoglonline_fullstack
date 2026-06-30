import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen } from "@/test/utils/render";

import ServiceCreateWizard from "@/app/me/services/new/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/me/services/new",
}));

const CATS = [{ id: 1, name_ar: "تصميم", children: [] }];

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
  server.use(http.get(`${API_URL}/categories`, () => HttpResponse.json(CATS)));
});

// Fill step 0 with valid required fields, then advance to the requested step.
async function fillToStep(
  user: ReturnType<typeof render>["user"],
  target: number,
  deliveryDays = "5",
) {
  await user.type(await screen.findByPlaceholderText("مثال: تصميم شعار احترافي لشركتك"), "تصميم شعار");
  await user.selectOptions(screen.getByDisplayValue("اختر التصنيف"), "1");
  await user.type(screen.getByPlaceholderText("مثال: 100"), "100");
  const days = screen.getByDisplayValue("5") as HTMLInputElement;
  await user.clear(days);
  await user.type(days, deliveryDays);
  // step 0 -> 1
  await user.click(screen.getByText("التالي"));
  if (target >= 1) {
    await user.type(
      await screen.findByPlaceholderText("اكتب وصفًا تفصيليًا عن خدمتك وما الذي يميزها…"),
      "هذا وصف تفصيلي كافٍ لتجاوز الحد الأدنى المطلوب للنشر",
    );
    await user.click(screen.getByText("التالي")); // 1 -> 2 (addons)
  }
  if (target >= 3) {
    await user.click(screen.getByText("التالي")); // 2 -> 3 (review)
  }
}

describe("ServiceCreateWizard", () => {
  // P2-07: price masks reject a second decimal point.
  it("masks the base price so only one decimal point survives", async () => {
    const { user } = render(<ServiceCreateWizard />);
    const price = (await screen.findByPlaceholderText("مثال: 100")) as HTMLInputElement;
    await user.type(price, "1.2.3");
    expect(price.value).toBe("1.23");
  });

  it("masks the add-on price so only one decimal point survives", async () => {
    const { user } = render(<ServiceCreateWizard />);
    await fillToStep(user, 2);
    await user.click(await screen.findByText("+ إضافة تطوير جديد"));
    const addonPrice = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    await user.type(addonPrice, "5.6.7");
    expect(addonPrice.value).toBe("5.67");
  });

  // P2-26: the review row uses correct Arabic plural (15 -> "يومًا", not "أيام").
  it("renders the correct Arabic day plural in the review step", async () => {
    const { user } = render(<ServiceCreateWizard />);
    await fillToStep(user, 3, "15");
    expect(await screen.findByText("15 يومًا")).toBeInTheDocument();
    expect(screen.queryByText("15 أيام")).not.toBeInTheDocument();
  });

  // The reported bug: an uploaded cover must preview from the picked file's local blob — the
  // server `url` is an auth-scoped endpoint a plain <img> can't load, so it must NOT be the src.
  it("previews an uploaded cover from a local blob, not the auth-scoped server url", async () => {
    const blobUrl = "blob:cover-preview";
    URL.createObjectURL = vi.fn(() => blobUrl);
    URL.revokeObjectURL = vi.fn();
    const scopedUrl = `${API_URL}/uploads/10`;
    server.use(
      http.post(`${API_URL}/uploads`, () =>
        HttpResponse.json(
          { id: 10, url: scopedUrl, kind: "image", original_name: "cover.png",
            content_type: "image/png", size: 3, created_at: "" },
          { status: 201 },
        ),
      ),
    );
    const { user } = render(<ServiceCreateWizard />);
    // step 0 -> 1 (the cover field lives on the description step)
    await user.type(await screen.findByPlaceholderText("مثال: تصميم شعار احترافي لشركتك"), "تصميم شعار");
    await user.selectOptions(screen.getByDisplayValue("اختر التصنيف"), "1");
    await user.type(screen.getByPlaceholderText("مثال: 100"), "100");
    await user.click(screen.getByText("التالي"));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" }));

    const img = (await screen.findByAltText("معاينة صورة الغلاف")) as HTMLImageElement;
    expect(img).toHaveAttribute("src", blobUrl);
    expect(img.getAttribute("src")).not.toBe(scopedUrl);
  });
});
