import { describe, expect, it } from "vitest";

import { apiError } from "@/lib/errors";

describe("apiError envelope parser", () => {
  it("reads the standardized {code, message_ar} envelope", () => {
    const e = { status: 400, body: { code: "below_minimum", message_ar: "المبلغ أقل من الحد الأدنى" } };
    expect(apiError(e)).toEqual({ code: "below_minimum", message_ar: "المبلغ أقل من الحد الأدنى" });
  });

  it("reads a validation_error with field details", () => {
    const e = { status: 400, body: { code: "validation_error", message_ar: "تحقّق من الحقول", fields: { title: ["مطلوب"] } } };
    expect(apiError(e)).toEqual({ code: "validation_error", message_ar: "تحقّق من الحقول" });
  });

  it("falls back to a generic Arabic message when there is no body", () => {
    expect(apiError(new Error("network")).message_ar).toMatch(/حدث خطأ/);
  });

  it("tolerates a legacy nested {detail:{...}} shape", () => {
    const e = { body: { detail: { code: "account_frozen", message_ar: "حسابك مجمّد" } } };
    expect(apiError(e)).toEqual({ code: "account_frozen", message_ar: "حسابك مجمّد" });
  });
});
