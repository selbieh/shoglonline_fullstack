import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { resetPublicSettingsCache } from "@/lib/settings";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ProfileWizard from "@/app/onboarding/profile/page";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/onboarding/profile",
}));

function baseHandlers(onPatch?: (body: Record<string, unknown>) => void) {
  return [
    http.get(`${API_URL}/me/profile`, () => HttpResponse.json({})),
    http.get(`${API_URL}/auth/me`, () =>
      HttpResponse.json({ email: "m@example.com", email_verified: true, phone_verified: false }),
    ),
    http.get(`${API_URL}/categories`, () =>
      HttpResponse.json([{ id: 1, name_ar: "تصميم", children: [] }]),
    ),
    http.get(`${API_URL}/skills`, () => HttpResponse.json([])),
    http.get(`${API_URL}/me/id-verification`, () => HttpResponse.json({ status: "none" })),
    http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "profiles.phone_verification": true })),
    http.patch(`${API_URL}/auth/me`, () => HttpResponse.json({})),
    http.patch(`${API_URL}/me/profile`, async ({ request }) => {
      onPatch?.((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({});
    }),
    http.post(`${API_URL}/me/profile/publish`, () => HttpResponse.json({})),
  ];
}

// Mandatory steps (personal / work / details) block advancing until their required fields are filled
// (ppt slide-02/10), so the happy path must populate them. Portfolio / certificates / verify are optional.
async function fillMandatoryToReview(user: ReturnType<typeof render>["user"]) {
  // personal (البيانات الشخصية): display name + overview + a (private) contact method
  await user.type(screen.getByPlaceholderText("مثال: أحمد محمد"), "أحمد");
  await user.type(screen.getByPlaceholderText(/اكتب نبذة مختصرة عنك/), "نبذة قصيرة");
  await user.type(screen.getByPlaceholderText("+9665…"), "501234567");
  await user.click(screen.getByRole("button", { name: "التالي" }));

  // work (العمل والمهارات): job title + main category + expertise level
  await screen.findByRole("heading", { name: "العمل والمهارات" });
  await user.type(screen.getByPlaceholderText("مثال: مصمم واجهات مستخدم"), "مصمم");
  await user.selectOptions(screen.getByLabelText(/المجال الرئيسي/), "1");
  await user.click(screen.getByRole("button", { name: "خبير" }));
  await user.click(screen.getByRole("button", { name: "التالي" }));

  // portfolio (optional) → certificates (optional) → details
  await screen.findByRole("heading", { name: "معرض الأعمال" });
  await user.click(screen.getByRole("button", { name: "التالي" }));
  await screen.findByRole("heading", { name: "الشهادات والتدريب" });
  await user.click(screen.getByRole("button", { name: "التالي" }));

  // details (تفاصيل العمل): hourly rate
  await screen.findByRole("heading", { name: "تفاصيل العمل" });
  await user.type(screen.getByPlaceholderText("أدخل سعر الساعة"), "25");
  await user.click(screen.getByRole("button", { name: "التالي" }));
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  resetPublicSettingsCache(); // avoid cross-test contamination of the 60s public-settings cache
  localStorage.setItem("sh_access", "tok");
});

describe("ProfileWizard", () => {
  it("redirects to /signin without a token", async () => {
    localStorage.clear();
    render(<ProfileWizard />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/signin"));
  });

  it("steps through the wizard, saves the draft, and publishes", async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(...baseHandlers((b) => { patched = b; }));
    const { user } = render(<ProfileWizard />);

    await fillMandatoryToReview(user);

    // verify (optional) → review
    await screen.findByRole("heading", { name: "التحقق" });
    await user.click(screen.getByRole("button", { name: "التالي" }));
    await screen.findByRole("heading", { name: "المراجعة والنشر" });

    // confirm + publish
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "إرسال للمراجعة" }));

    await waitFor(() =>
      expect(patched).toMatchObject({
        expertise_level: "expert",
        hourly_rate: "25",
        bio_title: "مصمم",
        private_contact_channel: "whatsapp",
        private_contact_value: "501234567",
      }),
    );
    expect(nav.push).toHaveBeenCalledWith("/me/profile");
  });

  it("blocks advancing past a mandatory step with empty fields", async () => {
    server.use(...baseHandlers());
    const { user } = render(<ProfileWizard />);
    // personal step is mandatory — التالي with empty fields must not advance
    await screen.findByRole("heading", { name: "البيانات الشخصية" });
    await user.click(screen.getByRole("button", { name: "التالي" }));
    // the required fields now flag inline (per-field), and the step does not advance
    expect(await screen.findByText("الاسم الظاهر للعملاء مطلوب")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "البيانات الشخصية" })).toBeInTheDocument();
  });

  it("verifies the phone via OTP", async () => {
    server.use(
      ...baseHandlers(),
      http.post(`${API_URL}/auth/phone/request-otp`, () => HttpResponse.json({ sent: true, debug_code: "1234" })),
      http.post(`${API_URL}/auth/phone/verify-otp`, () =>
        HttpResponse.json({ email: "m@example.com", email_verified: true, phone_verified: true }),
      ),
    );
    const { user } = render(<ProfileWizard />);

    await fillMandatoryToReview(user);
    await screen.findByRole("heading", { name: "التحقق" });

    await user.type(screen.getByLabelText(/رقم الجوال/), "501234567");
    await user.click(screen.getByRole("button", { name: "إرسال رمز التحقق" }));
    await user.type(await screen.findByLabelText("رمز التحقق"), "1234");
    await user.click(screen.getByRole("button", { name: "تأكيد" }));

    // Verified state shows in two intentional spots (the inline success message + the verified chip).
    expect((await screen.findAllByText(/تم التحقق من رقم الجوال/)).length).toBeGreaterThan(0);
  });

  // P2-21: editing the phone (or country code) after the OTP was sent must hide the now-stale code box.
  it("hides the OTP code box when the phone is edited after the code was sent", async () => {
    server.use(
      ...baseHandlers(),
      http.post(`${API_URL}/auth/phone/request-otp`, () => HttpResponse.json({ sent: true, debug_code: "1234" })),
    );
    const { user } = render(<ProfileWizard />);

    await fillMandatoryToReview(user);
    await screen.findByRole("heading", { name: "التحقق" });

    await user.type(screen.getByLabelText(/رقم الجوال/), "501234567");
    await user.click(screen.getByRole("button", { name: "إرسال رمز التحقق" }));
    // code box is shown after sending
    expect(await screen.findByLabelText("رمز التحقق")).toBeInTheDocument();

    // editing the number must reset otpSent → the code box disappears (before the fix it stayed)
    await user.type(screen.getByLabelText(/رقم الجوال/), "8");
    expect(screen.queryByLabelText("رمز التحقق")).not.toBeInTheDocument();
  });

  // P2-18: the core profile (/me/profile) must persist even when the avatar write (/auth/me) fails,
  // i.e. the avatar PATCH runs AFTER the profile PATCH so it can't abort the whole step save.
  it("saves the profile even when the avatar (/auth/me) write fails", async () => {
    let profilePatched: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_URL}/me/profile`, () => HttpResponse.json({})),
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ email: "m@example.com", email_verified: true, phone_verified: false }),
      ),
      http.get(`${API_URL}/categories`, () => HttpResponse.json([{ id: 1, name_ar: "تصميم", children: [] }])),
      http.get(`${API_URL}/skills`, () => HttpResponse.json([])),
      http.get(`${API_URL}/me/id-verification`, () => HttpResponse.json({ status: "none" })),
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "profiles.phone_verification": true })),
      http.patch(`${API_URL}/me/profile`, async ({ request }) => {
        profilePatched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
      // avatar write fails — must NOT discard the already-saved core fields
      http.patch(`${API_URL}/auth/me`, () => HttpResponse.json({ code: "server_error" }, { status: 500 })),
    );
    const { user } = render(<ProfileWizard />);

    // personal step → leaving it triggers saveProfile()
    await screen.findByRole("heading", { name: "البيانات الشخصية" });
    await user.type(screen.getByPlaceholderText("مثال: أحمد محمد"), "أحمد");
    await user.type(screen.getByPlaceholderText(/اكتب نبذة مختصرة عنك/), "نبذة قصيرة");
    await user.type(screen.getByPlaceholderText("+9665…"), "501234567");
    await user.click(screen.getByRole("button", { name: "التالي" }));

    // the core profile PATCH fired with the user's data despite the avatar failure
    await waitFor(() => expect(profilePatched).toMatchObject({ display_name: "أحمد", overview: "نبذة قصيرة" }));
  });
});
