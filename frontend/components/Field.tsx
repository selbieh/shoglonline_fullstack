import { type ReactNode } from "react";

/* Shared form field wrapper — label + (optional) hint + the input + an inline error note.
   When `error` is set, the wrapped `.field` input turns red (border + ring) and the message
   shows below it. This is the single per-field display used by every form/wizard so backend
   `fields` errors and client-side rules render identically everywhere. */
export default function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  /** the validation message, or "" / undefined when the field is OK. */
  error?: string;
  /** show a red asterisk and an aria-required hint on the group. */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`block ${error ? "[&_.field]:border-danger [&_.field]:ring-1 [&_.field]:ring-danger" : ""}`}
    >
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
        <span>
          {label}
          {required && <span className="text-danger" aria-hidden> *</span>}
        </span>
        {hint && <span className="text-xs font-normal text-sub">{hint}</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
