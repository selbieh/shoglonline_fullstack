"use client";

import { useState, type MouseEvent } from "react";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { AlertIcon, CheckIcon } from "@/components/icons";

/* Report a conversation to the admin chat-review queue (POST /conversations/<id>/report
   {reason}). Mirrors ReportButton's modal, but chat has its own endpoint and a free-text reason
   (the admin can warn / freeze / archive from the queue). Stops propagation so it can sit inside
   the conversation-row link. */

const REASONS = [
  "تحرّش أو إساءة",
  "احتيال أو نصب",
  "محتوى مسيء أو غير لائق",
  "محاولة تواصل أو دفع خارج المنصة",
  "محتوى مكرر أو إعلاني (سبام)",
  "أخرى",
];

export default function ChatReportButton({
  conversationId,
  className,
}: {
  conversationId: number;
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
    setTimeout(() => { setReason(""); setDetail(""); setDone(false); setError(""); }, 200);
  }

  async function submit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!reason || busy) return;
    setBusy(true);
    setError("");
    try {
      const text = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
      await api(`/conversations/${conversationId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: text.slice(0, 500) }),
      });
      setDone(true);
    } catch {
      setError("تعذّر إرسال البلاغ، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={trigger}
        title="إبلاغ عن المحادثة"
        aria-label="إبلاغ عن المحادثة"
        className={className ?? "grid h-8 w-8 shrink-0 place-content-center rounded-full text-[16px] text-sub transition hover:bg-danger-t hover:text-danger"}
      >
        <AlertIcon />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-content-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div className="w-full max-w-md rounded-l bg-white p-6 text-right shadow-xl" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="py-4 text-center">
                <span className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-success-t text-success">
                  <CheckIcon className="text-[24px]" />
                </span>
                <h3 className="mt-3 font-extrabold">تم استلام بلاغك</h3>
                <p className="mt-1 text-sm text-sub">سيراجع فريق الإدارة المحادثة ويتخذ الإجراء المناسب.</p>
                <button className="btn-primary mt-5 w-full" onClick={close}>إغلاق</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <AlertIcon className="text-[18px] text-danger" />
                  <h3 className="font-extrabold">الإبلاغ عن المحادثة</h3>
                </div>

                <fieldset className="mt-4 space-y-2">
                  <legend className="mb-1 text-sm font-bold text-ink">سبب البلاغ</legend>
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-m border px-3 py-2 text-sm transition ${
                        reason === r ? "border-primary bg-tint text-primary-dark" : "border-line hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="chat-report-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        className="accent-primary"
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </fieldset>

                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={3}
                  maxLength={400}
                  placeholder="تفاصيل إضافية (اختياري)"
                  className="mt-3 w-full rounded-m border border-line px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />

                {error && <p className="mt-2 text-sm text-danger">{error}</p>}

                <div className="mt-5 flex gap-2">
                  <button className="btn-primary flex-1 disabled:opacity-50" onClick={submit} disabled={!reason || busy}>
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
