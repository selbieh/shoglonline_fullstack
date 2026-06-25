"use client";

import { useState, type MouseEvent } from "react";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { AlertIcon, CheckIcon } from "@/components/icons";

/* Report-to-admin trigger + modal for any public entity — a service, job, freelancer card,
   portfolio work, proposal or buying request. Posts {kind, object_id, reason, detail} to
   /reports, which lands in the admin review queue where the item can be inspected and removed.
   Mirrors FavoriteButton: kind/id props, auth-gated, stops propagation so it can sit inside a
   clickable card/link. Pass `label` to render a labelled pill (detail pages); omit it for the
   icon-only round button used on cards. */

export type ReportKind =
  | "service" | "job" | "freelancer" | "portfolio" | "proposal" | "buying_request";

/** Pull the first human-readable string out of a DRF error body (field errors, non_field_errors,
    or {detail}). Returns undefined when there's nothing useful to show. */
function serverMessage(err: unknown): string | undefined {
  const body = (err as { body?: unknown })?.body;
  if (!body || typeof body !== "object") return undefined;
  const first = (v: unknown): string | undefined =>
    typeof v === "string" ? v : Array.isArray(v) ? first(v[0]) : undefined;
  const b = body as Record<string, unknown>;
  return first(b.detail ?? b.non_field_errors ?? Object.values(b)[0]);
}

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "محتوى مكرر أو إعلاني (سبام)" },
  { value: "scam", label: "احتيال أو نصب" },
  { value: "inappropriate", label: "محتوى مسيء أو غير لائق" },
  { value: "copyright", label: "انتهاك حقوق ملكية" },
  { value: "misleading", label: "معلومات مضللة أو خاطئة" },
  { value: "other", label: "أخرى" },
];

export default function ReportButton({
  kind, id, label, className,
}: {
  kind: ReportKind;
  id: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function trigger(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!tokens.access) {
      window.location.href = signinHereHref();
      return;
    }
    setOpen(true);
  }

  function close(e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setOpen(false);
    // reset after the modal closes so a re-open starts clean
    setTimeout(() => { setReason(""); setDetail(""); setDone(false); setError(""); }, 200);
  }

  async function submit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!reason || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/reports", {
        method: "POST",
        body: JSON.stringify({ kind, object_id: id, reason, detail: detail.trim() }),
      });
      setDone(true);
    } catch (err) {
      setError(serverMessage(err) ?? "تعذّر إرسال البلاغ، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  const trigerCls = label
    ? className ??
      "inline-flex items-center gap-1.5 rounded-m border border-line px-3 py-1.5 text-xs font-medium text-sub transition hover:border-danger/40 hover:text-danger"
    : className ??
      "grid h-9 w-9 place-content-center rounded-full border border-transparent text-[18px] text-sub transition hover:border-danger/30 hover:bg-danger-t hover:text-danger";

  return (
    <>
      <button type="button" onClick={trigger} title="إبلاغ" aria-label="إبلاغ" className={trigerCls}>
        <AlertIcon className={label ? "text-[14px]" : undefined} />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-content-center overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-l bg-white p-6 text-right shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-4 text-center">
                <span className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-success-t text-success">
                  <CheckIcon className="text-[24px]" />
                </span>
                <h3 className="mt-3 font-extrabold">تم استلام بلاغك</h3>
                <p className="mt-1 text-sm text-sub">سيقوم فريق الإدارة بمراجعة العنصر واتخاذ الإجراء المناسب.</p>
                <button className="btn-primary mt-5 w-full" onClick={close}>إغلاق</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <AlertIcon className="text-[18px] text-danger" />
                  <h3 className="font-extrabold">الإبلاغ عن مخالفة</h3>
                </div>

                <fieldset className="mt-4 space-y-2">
                  <legend className="mb-1 text-sm font-bold text-ink">سبب البلاغ</legend>
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-m border px-3 py-2 text-sm transition ${
                        reason === r.value ? "border-primary bg-tint text-primary-dark" : "border-line hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="accent-primary"
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </fieldset>

                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="تفاصيل إضافية (اختياري)"
                  className="mt-3 w-full rounded-m border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />

                {error && <p className="mt-2 text-sm text-danger">{error}</p>}

                <div className="mt-5 flex gap-2">
                  <button
                    className="btn-primary flex-1 disabled:opacity-50"
                    onClick={submit}
                    disabled={!reason || busy}
                  >
                    {busy ? "جارٍ الإرسال…" : "إرسال البلاغ"}
                  </button>
                  <button className="btn-secondary" onClick={close} disabled={busy}>إلغاء</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
