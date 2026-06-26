import { describe, expect, it } from "vitest";
import { hasContactInfo } from "@/lib/contactGuard";

describe("hasContactInfo", () => {
  it("flags real contact details (phone, email, links, handles)", () => {
    expect(hasContactInfo("راسلني واتساب 0501234567")).toBe(true);
    expect(hasContactInfo("تواصل معي على 0501234567")).toBe(true);
    expect(hasContactInfo("name@host.com")).toBe(true);
    expect(hasContactInfo("زوروا موقعنا www.example.com")).toBe(true);
    expect(hasContactInfo("حسابي على انستغرام")).toBe(true);
    expect(hasContactInfo("بريدي الإلكتروني هو ahmed at gmail dot com")).toBe(true);
  });

  it("does not flag legitimate Arabic words that merely contain a keyword substring", () => {
    // "الرقمية" (digital) contains "رقمي" (my number) — must NOT trip the guard.
    expect(hasContactInfo("تصميم شعار يصلح للمنصات الرقمية والمطبوعات")).toBe(false);
    // "البريد" (the mail) without the possessive "ي" must NOT trip the "بريدي" keyword.
    expect(hasContactInfo("خدمة البريد السريع متاحة")).toBe(false);
    expect(
      hasContactInfo(
        "تصميم شعار احترافي يمثل شركة إدارة الأسواق المحلية، مع قابلية استخدامه على المطبوعات واللافتات والمنصات الرقمية.",
      ),
    ).toBe(false);
  });

  it("normalizes Arabic-Indic digits before phone detection", () => {
    expect(hasContactInfo("اتصل بي على ٠٥٠١٢٣٤٥٦٧")).toBe(true);
  });
});
