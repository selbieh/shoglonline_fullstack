"use client";

import { useCallback, useState } from "react";
import { apiError, apiFieldErrors } from "@/lib/errors";

/**
 * One small hook every form/wizard uses so client-side rules and backend `fields` errors
 * render through the same per-input mechanism (see components/Field.tsx).
 *
 * - `errors`     — { field: message } map driving the red outline + inline note.
 * - `formError`  — a single banner message for errors that don't belong to any one input
 *                  (global/domain errors, e.g. "job_locked", or a network failure).
 * - `applyApiError(e)` — the key piece: a thrown API error with a field-keyed `fields`
 *   envelope is mapped onto the inputs; anything else falls back to the banner. Returns the
 *   list of field keys it set (empty when it fell back), so a wizard can jump to the step
 *   that owns the first failing field.
 */
export type FieldErrors = Record<string, string>;

export function useFieldErrors() {
  const [errors, setErrorsState] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");

  const setErrors = useCallback((fe: FieldErrors) => setErrorsState(fe), []);

  /** Drop the errors for the named fields — call as the user edits them, so the red mark clears. */
  const clearFields = useCallback((...names: string[]) => {
    setErrorsState((e) => {
      if (!names.some((n) => n in e)) return e;
      const next = { ...e };
      for (const n of names) delete next[n];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setErrorsState({});
    setFormError("");
  }, []);

  const applyApiError = useCallback((e: unknown): string[] => {
    const fe = apiFieldErrors(e);
    const keys = Object.keys(fe);
    if (keys.length) {
      setErrorsState(fe);
      setFormError("");
      return keys;
    }
    setErrorsState({});
    setFormError(apiError(e).message_ar);
    return [];
  }, []);

  return { errors, setErrors, clearFields, formError, setFormError, reset, applyApiError };
}

/** A per-field rule returns "" when the field is valid, or the Arabic error message otherwise. */
export type Rule = () => string;

/** Run the rules for `fields` and collect the ones that failed into a { field: message } map. */
export function validateFields(rules: Record<string, Rule>, fields: string[]): FieldErrors {
  const found: FieldErrors = {};
  for (const f of fields) {
    const msg = rules[f]?.() ?? "";
    if (msg) found[f] = msg;
  }
  return found;
}

/** Earliest wizard step that owns one of the failing fields (used to bounce back on error). */
export function earliestStep(
  keys: string[],
  fieldStep: Record<string, number>,
  fallback: number,
): number {
  const steps = keys.map((k) => fieldStep[k] ?? fallback);
  return steps.length ? Math.min(...steps) : fallback;
}
