import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils/render";

import Field from "@/components/Field";

describe("<Field>", () => {
  it("ties the error message to the input via aria-describedby and sets aria-invalid", () => {
    const { container } = render(
      <Field label="الاسم" error="هذا الحقل مطلوب" required>
        <input className="field" defaultValue="" />
      </Field>,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("هذا الحقل مطلوب");
    expect(alert.id).toBeTruthy();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveAttribute("aria-required", "true");
  });

  it("does not set aria-invalid/aria-describedby when there is no error", () => {
    const { container } = render(
      <Field label="الاسم">
        <input className="field" defaultValue="" />
      </Field>,
    );
    const input = container.querySelector("input") as HTMLInputElement;

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("passes non-element children through untouched (no crash)", () => {
    render(
      <Field label="ملاحظة" error="خطأ">
        نص عادي
      </Field>,
    );
    expect(screen.getByText("نص عادي")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("خطأ");
  });
});
