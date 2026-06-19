"use client";

import { useState } from "react";

import Avatar from "@/components/Avatar";
import { InfoIcon, LockIcon } from "@/components/icons";
import { CTX_LABEL } from "@/lib/chatFormat";
import type { Conversation } from "./types";

/** Conversation thread header: avatar + name + context, a deep-link to the service/job/contract,
 * and an info/lock pair. The lock reveals the "chat is monitored" safety notice (FR-CHAT-10). */
export default function ThreadHeader({ conv }: { conv: Conversation }) {
  const [notice, setNotice] = useState<"" | "monitored" | "info">("");
  const ctx = conv.context;

  return (
    <div className="relative flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <a href="/messages" className="text-lg text-sub md:hidden" aria-label="رجوع">
          ‹
        </a>
        <Avatar name={conv.other.name} src={conv.other.avatar || null} className="h-10 w-10 shrink-0" textClassName="text-sm" />
        <div className="min-w-0">
          <b className="block truncate text-sm text-ink">{conv.other.name}</b>
          {ctx?.title ? (
            <p className="truncate text-xs text-sub">
              {CTX_LABEL[conv.context_type] || ""}: {ctx.title}
            </p>
          ) : (
            <p className="truncate text-xs text-sub">{CTX_LABEL[conv.context_type] || "محادثة"}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {ctx?.href && (
          <a
            href={ctx.href}
            className="rounded-m bg-tint px-3 py-1.5 text-xs font-semibold text-primary-dark transition hover:bg-primary hover:text-white"
          >
            {ctx.label}
          </a>
        )}
        <button
          type="button"
          aria-label="معلومات"
          onClick={() => setNotice((n) => (n === "info" ? "" : "info"))}
          className="grid h-8 w-8 place-content-center rounded-full text-sub transition hover:bg-bg hover:text-ink"
        >
          <InfoIcon className="text-[16px]" />
        </button>
        <button
          type="button"
          aria-label="المحادثة مراقَبة لأمانك"
          onClick={() => setNotice((n) => (n === "monitored" ? "" : "monitored"))}
          className="grid h-8 w-8 place-content-center rounded-full bg-tint text-primary-dark transition hover:bg-primary hover:text-white"
        >
          <LockIcon className="text-[15px]" />
        </button>
      </div>

      {notice && (
        <div className="absolute left-3 top-full z-20 mt-2 w-72 rounded-m border border-line bg-white p-3 text-xs leading-relaxed text-sub shadow-card">
          <div className="flex items-start gap-2">
            <LockIcon className="mt-0.5 shrink-0 text-[15px] text-primary-dark" />
            <p>
              {notice === "monitored"
                ? "المحادثة مراقَبة لحمايتك. أي تواصل خارج المنصة لن يُؤخذ بعين الاعتبار عند حدوث نزاع."
                : "أبقِ التواصل والدفع داخل المنصة. إن لم تُقرأ رسالتك خلال ١٠ دقائق نُرسل للطرف الآخر بريدًا تلقائيًا برابط المحادثة."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
