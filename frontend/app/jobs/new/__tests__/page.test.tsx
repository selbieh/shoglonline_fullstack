import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import NewJobPage from "@/app/jobs/new/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, prefetch: vi.fn() }),
}));

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
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
