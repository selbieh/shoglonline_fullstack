/**
 * Parse the backend's standardized error envelope.
 *
 * The API always returns `{ code, message_ar, fields? }` (see backend
 * apps/core/api/exception_handler.py). `api()` throws an error carrying that body as `.body`,
 * so callers do `const { code, message_ar } = apiError(e)` instead of regex-scraping the JSON.
 */
export type ApiErrorBody = {
  code?: string;
  message_ar?: string;
  fields?: Record<string, unknown>;
  detail?: { code?: string; message_ar?: string } | string;
};

export function apiError(e: unknown): { code: string; message_ar: string } {
  const body = (e as { body?: ApiErrorBody } | undefined)?.body;
  if (body && typeof body === "object") {
    if (typeof body.message_ar === "string" && body.message_ar) {
      return { code: typeof body.code === "string" ? body.code : "", message_ar: body.message_ar };
    }
    // tolerate a legacy/nested {detail:{code,message_ar}} shape just in case
    if (body.detail && typeof body.detail === "object" && typeof body.detail.message_ar === "string") {
      return { code: body.detail.code ?? "", message_ar: body.detail.message_ar };
    }
  }
  return { code: "", message_ar: "حدث خطأ — حاول مجددًا" };
}

/**
 * Flatten the `fields` map from a `validation_error` envelope into `{ field: message }`,
 * so a form can highlight the offending input instead of showing only the generic
 * "تحقّق من الحقول المدخلة". DRF returns each field's errors as a list (and nested
 * serializers as objects/lists) — we collapse to the first human-readable string.
 */
export function apiFieldErrors(e: unknown): Record<string, string> {
  const fields = (e as { body?: ApiErrorBody } | undefined)?.body?.fields;
  const out: Record<string, string> = {};
  if (fields && typeof fields === "object") {
    for (const [key, val] of Object.entries(fields)) {
      out[key] = flatten(val);
    }
  }
  return out;
}

function flatten(val: unknown): string {
  if (Array.isArray(val)) return val.map(flatten).filter(Boolean).join("، ");
  if (val && typeof val === "object") return Object.values(val).map(flatten).filter(Boolean).join("، ");
  return val == null ? "" : String(val);
}
