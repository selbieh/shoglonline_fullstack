import { describe, expect, it } from "vitest";

import { apiFieldErrors } from "@/lib/errors";
import { validateFields, earliestStep, type Rule } from "@/lib/useFieldErrors";

describe("validateFields", () => {
  const rules: Record<string, Rule> = {
    title: () => "" /* ok */,
    category: () => "اختر التصنيف",
    price: () => "أدخل سعرًا",
  };

  it("collects only the fields whose rule fails", () => {
    expect(validateFields(rules, ["title", "category", "price"])).toEqual({
      category: "اختر التصنيف",
      price: "أدخل سعرًا",
    });
  });

  it("ignores fields not in the requested subset", () => {
    expect(validateFields(rules, ["title"])).toEqual({});
  });

  it("treats a missing rule as valid (no error)", () => {
    expect(validateFields(rules, ["unknown_field"])).toEqual({});
  });
});

describe("earliestStep", () => {
  const fieldStep = { a: 2, b: 0, c: 1 };

  it("returns the lowest step among the failing fields", () => {
    expect(earliestStep(["a", "c"], fieldStep, 5)).toBe(1);
    expect(earliestStep(["a", "b"], fieldStep, 5)).toBe(0);
  });

  it("uses the fallback for an unmapped field", () => {
    expect(earliestStep(["zzz"], fieldStep, 4)).toBe(4);
  });

  it("returns the fallback when there are no keys", () => {
    expect(earliestStep([], fieldStep, 3)).toBe(3);
  });
});

describe("apiFieldErrors", () => {
  it("flattens the DRF {field: [msg]} envelope to {field: msg}", () => {
    const e = { body: { code: "validation_error", fields: { budget_min: ["سالب"], title: ["مطلوب"] } } };
    expect(apiFieldErrors(e)).toEqual({ budget_min: "سالب", title: "مطلوب" });
  });

  it("joins multiple messages for one field", () => {
    const e = { body: { fields: { rating: ["من 1 إلى 5", "إلزامي"] } } };
    expect(apiFieldErrors(e)).toEqual({ rating: "من 1 إلى 5، إلزامي" });
  });

  it("returns an empty map when there is no field detail", () => {
    expect(apiFieldErrors({ body: { code: "job_locked", message_ar: "مقفل" } })).toEqual({});
    expect(apiFieldErrors(new Error("network"))).toEqual({});
  });
});
