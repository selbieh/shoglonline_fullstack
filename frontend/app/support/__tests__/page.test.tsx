import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import SupportPage from "@/app/support/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/support",
}));

const TYPES = [{ id: 5, name_ar: "استفسار عام", is_dispute: false }];

function base() {
  server.use(
    http.get(`${API_URL}/me/tickets`, () => HttpResponse.json({ results: [] })),
    http.get(`${API_URL}/ticket-types`, () => HttpResponse.json({ results: TYPES })),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("SupportPage", () => {
  it("trims the title and message before POSTing the ticket", async () => {
    base();
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_URL}/tickets`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    const { user } = render(<SupportPage />);
    await user.click(await screen.findByText("+ تذكرة جديدة"));

    await user.selectOptions(await screen.findByRole("combobox"), "5");
    await user.type(screen.getByPlaceholderText("العنوان"), "  مرحبا  ");
    await user.type(screen.getByPlaceholderText("اشرح مشكلتك…"), "  تفاصيل المشكلة  ");
    await user.click(screen.getByText("إرسال"));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({ type_id: 5, title: "مرحبا", message: "تفاصيل المشكلة" });
  });
});
