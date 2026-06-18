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
