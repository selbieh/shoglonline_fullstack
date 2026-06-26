"use client";

/* Onboarding wizard progress (ppt slide-10). RTL — step 1 is on the right. Renders the
   compact segmented bar used across the "تهيئة الحساب" screens: a completion label + one
   segment per step (filled periwinkle up to & including the current step). Optional steps
   are hinted with a lighter, dashed segment. Reusable by the freelancer & employer wizards. */

export type WizardStep = {
  id: string;
  label: string;
  /** optional steps can be skipped (dashed segment) — per the slide-10 legend. */
  optional?: boolean;
};

export default function WizardStepper({
  steps,
  current,
  percent,
  completionSubject = "ملفك الشخصي جاهز",
}: {
  steps: WizardStep[];
  /** zero-based index of the active step. */
  current: number;
  /** overall completion %, shown as "{completionSubject} بنسبة X%". */
  percent?: number;
  /** subject phrase incl. the gender-agreeing adjective, e.g. "خدمتك جاهزة". */
  completionSubject?: string;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs font-medium text-sub">
        {typeof percent === "number" ? (
          <span>
            {completionSubject} بنسبة {percent.toLocaleString("en-US")}٪
          </span>
        ) : (
          <span aria-hidden />
        )}
        <span>
          {steps[current]?.label} · خطوة {(current + 1).toLocaleString("en-US")} من{" "}
          {steps.length.toLocaleString("en-US")}
        </span>
      </div>
      {/* RTL segments — first step on the right */}
      <ol dir="rtl" className="mt-2 flex gap-1.5" aria-label="مراحل التقديم">
        {steps.map((s, i) => {
          const reached = i <= current;
          return (
            <li
              key={s.id}
              title={`${s.label}${s.optional ? " (اختياري)" : ""}`}
              aria-current={i === current ? "step" : undefined}
              className={[
                "h-1.5 flex-1 rounded-full transition-colors",
                reached ? "bg-primary" : "bg-line",
                s.optional && !reached ? "border border-dashed border-line-strong bg-transparent" : "",
              ].join(" ")}
            />
          );
        })}
      </ol>
    </div>
  );
}
