import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import OwnerServicePage from "@/app/me/services/[id]/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/me/services/7",
}));

function makeService(over: Record<string, unknown> = {}) {
  return {
    id: 7, title: "تصميم شعار", slug: "logo", status: "live",
    description: "وصف الخدمة الحالي الذي يزيد عن ثلاثين حرفًا بكل تأكيد هنا",
    what_you_get: "", keywords: [], base_price: "100", delivery_days: 5,
    category_name: "تصميم", cover_image: "", reject_reason: "",
    addons: [], views_count: 10, orders_count: 2, conversion: 20,
    ...over,
  };
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("OwnerServicePage edit", () => {
  it("shows the reject reason near the status chip for a rejected service (P2-23)", async () => {
    server.use(http.get(`${API_URL}/me/services/7`, () =>
      HttpResponse.json(makeService({ status: "rejected", reject_reason: "يحتوي على معلومات تواصل" }))));
    render(<OwnerServicePage />);
    expect(await screen.findByText("مرفوضة")).toBeInTheDocument();
    expect(await screen.findByText("يحتوي على معلومات تواصل")).toBeInTheDocument();
    expect(screen.getByText("سبب الرفض:")).toBeInTheDocument();
  });

  it("blocks save and shows per-field rule when description is too short (P2-06)", async () => {
    server.use(http.get(`${API_URL}/me/services/7`, () => HttpResponse.json(makeService())));
    let patched = false;
    server.use(http.patch(`${API_URL}/me/services/7`, () => { patched = true; return HttpResponse.json({}); }));

    const { user } = render(<OwnerServicePage />);
    await user.click(await screen.findByText("تعديل الخدمة"));
    const desc = await screen.findByDisplayValue(/وصف الخدمة الحالي/);
    await user.clear(desc);
    await user.type(desc, "قصير");
    await user.click(screen.getByText("حفظ التعديلات"));

    expect(await screen.findByText("الوصف قصير جدًا — اكتب 30 حرفًا على الأقل")).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it("renders backend field errors per-input, not as one generic banner (P1-03)", async () => {
    server.use(http.get(`${API_URL}/me/services/7`, () => HttpResponse.json(makeService())));
    server.use(http.patch(`${API_URL}/me/services/7`, () =>
      HttpResponse.json(
        { code: "validation_error", message_ar: "تحقّق من الحقول المدخلة", fields: { base_price: ["السعر غير صالح من الخادم"] } },
        { status: 400 },
      )));

    const { user } = render(<OwnerServicePage />);
    await user.click(await screen.findByText("تعديل الخدمة"));
    // valid client-side values so the request reaches the backend
    await user.click(screen.getByText("حفظ التعديلات"));

    expect(await screen.findByText("السعر غير صالح من الخادم")).toBeInTheDocument();
  });
});
