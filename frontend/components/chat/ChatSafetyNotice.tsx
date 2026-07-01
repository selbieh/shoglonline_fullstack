"use client";

import { useEffect, useState } from "react";

import { useDialogA11y } from "@/lib/useDialogA11y";
import { AlertIcon, ShieldIcon, WalletIcon } from "@/components/icons";

/**
 * Chat safety warning (FR-CHAT-10). Renders two things:
 *  - a persistent warning strip that stays visible at the top of every thread, and
 *  - an acknowledgment popup shown once per conversation, the first time the user opens it —
 *    i.e. at the start of every NEW conversation, which is when contact-sharing pressure happens.
 * The popup requires an explicit "فهمت وأوافق" and remembers acknowledged conversation ids in
 * localStorage so it doesn't nag on re-opening the same thread; the persistent strip keeps the
 * reminder in view afterwards.
 */
const ACK_KEY = "chat_safety_ack_v1";
const ACK_LIMIT = 200; // cap the remembered-ids list so localStorage can't grow unbounded

function readAcked(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(ACK_KEY) || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export default function ChatSafetyNotice({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);

  // Client-only: read the acknowledgment after mount to avoid a hydration mismatch.
  useEffect(() => {
    if (!conversationId) return;
    try {
      if (!readAcked().includes(String(conversationId))) setOpen(true);
    } catch {
      setOpen(true); // storage blocked (private mode) → still warn the user
    }
  }, [conversationId]);

  function acknowledge() {
    try {
      const id = String(conversationId);
      const acked = readAcked();
      if (!acked.includes(id)) {
        acked.push(id);
        localStorage.setItem(ACK_KEY, JSON.stringify(acked.slice(-ACK_LIMIT)));
      }
    } catch {
      /* ignore — worst case the popup shows again next time */
    }
    setOpen(false);
  }

  const dialogRef = useDialogA11y(open, acknowledge);

  return (
    <>
      <div className="mx-auto flex max-w-md items-start gap-2 rounded-m border border-warn/25 bg-warn-t px-3 py-2 text-right text-[11px] leading-relaxed text-warn">
        <AlertIcon className="mt-0.5 shrink-0 text-[14px]" />
        <p>
          جميع الرسائل تخضع لمراجعة الإدارة. مشاركة رقم الهاتف أو وسائل التواصل الخارجية أو الدفع خارج المنصة
          يُعرّض حسابك للتجميد وغرامة مالية تُخصم من رصيدك.
        </p>
      </div>

      {open && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="تنبيه أمان المحادثة"
          className="fixed inset-0 z-50 grid place-content-center bg-black/50 p-4 focus:outline-none"
          onClick={acknowledge}
        >
          <div className="w-full max-w-md rounded-l bg-white p-6 text-right shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto grid h-12 w-12 place-content-center rounded-full bg-warn-t text-warn">
              <ShieldIcon className="text-[24px]" />
            </div>
            <h3 className="mt-3 text-center text-lg font-extrabold text-ink">تنبيه هام قبل بدء المحادثة</h3>

            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-sub">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full bg-tint text-primary-dark">
                  <ShieldIcon className="text-[14px]" />
                </span>
                <span>
                  <b className="text-ink">جميع الرسائل تخضع للمراجعة</b> من قِبل فريق الإدارة لحمايتك وضمان حقوقك.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full bg-danger-t text-danger">
                  <AlertIcon className="text-[14px]" />
                </span>
                <span>
                  مشاركة رقم الهاتف أو وسائل التواصل الخارجية أو محاولة الدفع خارج المنصة{" "}
                  <b className="text-danger">تُعرّضك لغرامة مالية وتجميد حسابك ورصيدك</b>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-content-center rounded-full bg-tint text-primary-dark">
                  <WalletIcon className="text-[14px]" />
                </span>
                <span>أبقِ التواصل والدفع داخل المنصة لتبقى معاملاتك مضمونة وموثّقة.</span>
              </li>
            </ul>

            <button type="button" className="btn-primary mt-6 w-full" onClick={acknowledge}>
              فهمت وأوافق
            </button>
          </div>
        </div>
      )}
    </>
  );
}
