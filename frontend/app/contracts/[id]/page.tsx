"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { STATUS_CHIP, STATUS_LABEL } from "@/lib/contractStatus";
import { apiError } from "@/lib/errors";
import ReviewsSection from "@/components/ReviewsSection";
import { ChatIcon } from "@/components/icons";

type Submission = {
  id: number;
  notes: string;
  files: { name: string; url: string }[];
  status: string;
  reject_reason: string;
  created_at: string;
};
type UpdateRequest = {
  id: number;
  new_budget: string | null;
  new_deadline: string | null;
  message: string;
  status: string;
  reject_reason: string;
  requested_by_me: boolean;
  created_at: string;
};
type Ev = { id: number; kind: string; detail: string; created_at: string };
type Contract = {
  id: number;
  title: string;
  scope: string;
  budget: string;
  status: string;
  deadline: string | null;
  my_role: "employer" | "worker";
  counterpart: { id: number; name: string; email: string };
  commission_pct: string;
  commission_amount: string;
  worker_earning: string;
  funding_deadline: string | null;
  warranty_ends_at: string | null;
  resolution_note: string;
  cancel_reason: string;
  cancel_requested_by_me: boolean;
  cancel_pending: boolean;
  submissions: Submission[];
  update_requests: UpdateRequest[];
  events: Ev[];
};

const SUB_CHIP: Record<string, string> = {
  open: "bg-warn-t text-warn",
  accepted: "bg-success-t text-success",
  rejected: "bg-danger-t text-danger",
};

export default function ContractDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Contract | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const load = useCallback(async () => {
    try {
      setC(await api<Contract>(`/contracts/${id}`));
    } catch {
      router.replace("/contracts");
    }
  }, [id, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  async function act(path: string, body?: object, okText = "تم بنجاح") {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await api<Contract>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setC(updated);
      setNotes("");
      setNewBudget("");
      setNewDeadline("");
      setMsg({ ok: true, text: `✅ ${okText}` });
    } catch (e) {
      setMsg({ ok: false, text: `⚠️ ${apiError(e).message_ar}` });
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    try {
      const conv = await api<{ id: number }>("/conversations", {
        method: "POST",
        body: JSON.stringify({ contract_id: id }),
      });
      router.push(`/messages/${conv.id}`);
    } catch {
      setMsg({ ok: false, text: "⚠️ تعذّر فتح المحادثة" });
    }
  }

  if (!c) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  const submissions = c.submissions ?? [];
  const update_requests = c.update_requests ?? [];
  const events = c.events ?? [];
  const isEmployer = c.my_role === "employer";
  const openSub = submissions.find((s) => s.status === "open");
  const pendingUpdate = update_requests.find((u) => u.status === "pending" || u.status === "pending_funding");
  const canDeliver = c.my_role === "worker" && (c.status === "active" || c.status === "delivered");
  const canReviewSub = isEmployer && c.status === "delivered" && openSub;
  const canChangeTerms = c.status === "active" || c.status === "delivered";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href="/contracts" className="text-sm text-primary-dark">← كل العقود</a>
        <span className={`rounded-full px-3 py-1 text-xs ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{c.title}</h1>
        {c.status !== "pending_funding" && (
          <button className="btn-secondary gap-1.5" onClick={openChat}><ChatIcon className="text-[16px]" /> محادثة الطرف الآخر</button>
        )}
      </div>
      <p className="mt-1 text-sm text-sub">
        {isEmployer ? "أنت صاحب العمل" : "أنت المستقل"} · الطرف الآخر: {c.counterpart.name}
      </p>

      {msg && (
        <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
          {msg.text}
        </p>
      )}

      {/* money summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-sub">قيمة العقد</p>
          <p className="mt-1 text-2xl font-extrabold" dir="ltr">${c.budget}</p>
        </div>
        <div className="card">
          <p className="text-sm text-sub">صافي أرباح المستقل</p>
          <p className="mt-1 text-2xl font-extrabold text-success" dir="ltr">${c.worker_earning}</p>
        </div>
        <div className="card">
          <p className="text-sm text-sub">عمولة المنصة ({c.commission_pct}%)</p>
          <p className="mt-1 text-2xl font-extrabold text-sub" dir="ltr">${c.commission_amount}</p>
        </div>
      </div>

      {c.scope && (
        <section className="card mt-4">
          <h2 className="font-bold">نطاق العمل</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-primary-deep">{c.scope}</p>
          {c.deadline && <p className="mt-2 text-xs text-sub">الموعد النهائي: {c.deadline}</p>}
        </section>
      )}

      {/* funding (employer, pending) */}
      {c.status === "pending_funding" && (
        <section className="card mt-4 border border-warn">
          <h2 className="font-bold text-warn">بانتظار التمويل</h2>
          {isEmployer ? (
            <>
              <p className="mt-1 text-sm text-sub">
                يُحجز مبلغ ${c.budget} من رصيدك المتاح في الضمان لتفعيل العقد. إن لم يُموَّل قبل
                {c.funding_deadline ? ` ${new Date(c.funding_deadline).toLocaleString("ar")}` : " انتهاء المهلة"} يُلغى تلقائيًا.
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" disabled={busy} onClick={() => act(`/contracts/${id}/fund`, undefined, "فُعّل العقد بعد حجز الضمان")}>
                  تمويل وتفعيل العقد
                </button>
                <a href="/wallet" className="btn-secondary">شحن المحفظة أولًا</a>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-sub">بانتظار قيام صاحب العمل بتمويل العقد لبدء التنفيذ.</p>
          )}
        </section>
      )}

      {/* deliver (worker) */}
      {canDeliver && (
        <section className="card mt-4">
          <h2 className="font-bold">تسليم العمل</h2>
          <textarea
            className="mt-2 w-full field"
            rows={3}
            placeholder="ملاحظات التسليم (روابط الملفات، شرح، إلخ)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="btn-primary mt-2"
            disabled={busy || !notes.trim()}
            onClick={() => act(`/contracts/${id}/submissions`, { notes }, "أُرسل التسليم")}
          >
            إرسال التسليم
          </button>
        </section>
      )}

      {/* review submission (employer) */}
      {canReviewSub && openSub && (
        <section className="card mt-4 border border-primary">
          <h2 className="font-bold">مراجعة التسليم</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-m bg-bg p-3 text-sm">{openSub.notes}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => {
                if (confirm("بقبول التسليم يكتمل العقد وتبدأ فترة الضمان. متابعة؟"))
                  act(`/submissions/${openSub.id}/accept`, undefined, "قُبل التسليم — بدأت فترة الضمان");
              }}
            >
              ✅ قبول التسليم
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                const reason = prompt("سبب الرفض (إلزامي):");
                if (reason && reason.trim()) act(`/submissions/${openSub.id}/reject`, { reason }, "رُفض التسليم — يمكن للمستقل إعادة الإرسال");
              }}
            >
              ✕ رفض مع سبب
            </button>
          </div>
        </section>
      )}

      {/* warranty notice */}
      {c.status === "completed" && c.warranty_ends_at && (
        <section className="card mt-4 bg-success-t">
          <h2 className="font-bold text-success">اكتمل العقد</h2>
          <p className="mt-1 text-sm text-primary-deep">
            تتحرر أرباح المستقل (${c.worker_earning}) إلى الرصيد المتاح تلقائيًا بنهاية فترة الضمان:{" "}
            {new Date(c.warranty_ends_at).toLocaleDateString("ar")}.
          </p>
          {c.resolution_note && <p className="mt-1 text-xs text-sub">{c.resolution_note}</p>}
        </section>
      )}

      {/* dispute banner */}
      {c.status === "disputed" && (
        <section className="card mt-4 border border-danger bg-danger-t">
          <h2 className="font-bold text-danger">العقد متنازع عليه</h2>
          <p className="mt-1 text-sm text-primary-deep">تتم مراجعته من قبل الإدارة لاتخاذ قرار التسوية.</p>
        </section>
      )}

      {/* terms change + cancel + dispute */}
      {canChangeTerms && (
        <section className="card mt-4 space-y-4">
          {c.cancel_pending ? (
            <div className="rounded-m bg-warn-t p-3 text-sm">
              {c.cancel_requested_by_me ? (
                "طلبت إلغاء العقد — بانتظار تأكيد الطرف الآخر."
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>طلب الطرف الآخر إلغاء العقد بالتراضي (يُرد الضمان كاملًا لصاحب العمل).</span>
                  <button className="btn-primary" disabled={busy} onClick={() => act(`/contracts/${id}/cancel/confirm`, undefined, "أُلغي العقد ورُدّ الضمان")}>
                    تأكيد الإلغاء
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-bold">طلب تعديل الشروط</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="w-36 field" dir="ltr"
                    placeholder="ميزانية جديدة" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} />
                  <input type="date" className="field"
                    value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
                  <button className="btn-secondary" disabled={busy || (!newBudget && !newDeadline)}
                    onClick={() => act(`/contracts/${id}/update-requests`,
                      { new_budget: newBudget || undefined, new_deadline: newDeadline || undefined }, "أُرسل طلب التعديل")}>
                    إرسال الطلب
                  </button>
                </div>
                <p className="mt-1 text-xs text-sub">زيادة الميزانية تحجز الفرق من رصيد صاحب العمل؛ التخفيض يردّه.</p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button className="text-sm text-sub hover:text-danger"
                  onClick={() => { const r = prompt("سبب طلب الإلغاء (اختياري):"); act(`/contracts/${id}/cancel`, { reason: r || "" }, "أُرسل طلب الإلغاء — بانتظار الطرف الآخر"); }}>
                  طلب إلغاء بالتراضي
                </button>
                <button className="text-sm text-sub hover:text-danger"
                  onClick={() => { if (confirm("فتح نزاع يوقف العقد ويحيله للإدارة. متابعة؟")) { const r = prompt("سبب النزاع:"); act(`/contracts/${id}/dispute`, { reason: r || "" }, "فُتح النزاع — ستتولاه الإدارة"); } }}>
                  فتح نزاع
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* pending update request awaiting my response */}
      {pendingUpdate && !pendingUpdate.requested_by_me && canChangeTerms && (
        <section className="card mt-4 border border-primary">
          <h2 className="font-bold">طلب تعديل بانتظار ردّك</h2>
          <p className="mt-1 text-sm">
            {pendingUpdate.new_budget && <>ميزانية جديدة: <b dir="ltr">${pendingUpdate.new_budget}</b> · </>}
            {pendingUpdate.new_deadline && <>موعد جديد: <b>{pendingUpdate.new_deadline}</b></>}
          </p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => act(`/update-requests/${pendingUpdate.id}/respond`, { accept: true }, "قُبل التعديل")}>قبول</button>
            <button className="btn-secondary" disabled={busy} onClick={() => { const r = prompt("سبب الرفض:"); act(`/update-requests/${pendingUpdate.id}/respond`, { accept: false, reason: r || "" }, "رُفض التعديل"); }}>رفض</button>
          </div>
        </section>
      )}

      {/* submissions history */}
      {submissions.length > 0 && (
        <section className="card mt-4">
          <h2 className="font-bold">سجل التسليمات</h2>
          <ul className="mt-2 space-y-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-m bg-bg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-sub">{new Date(s.created_at).toLocaleString("ar")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${SUB_CHIP[s.status]}`}>
                    {s.status === "open" ? "قيد المراجعة" : s.status === "accepted" ? "مقبول" : "مرفوض"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{s.notes}</p>
                {s.reject_reason && <p className="mt-1 text-xs text-danger">سبب الرفض: {s.reject_reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* reviews — after completion (FR-REV) */}
      {c.status === "completed" && <ReviewsSection contractId={id} />}

      {/* timeline */}
      {events.length > 0 && (
        <section className="card mt-4">
          <h2 className="font-bold">سجل العقد</h2>
          <ul className="mt-2 space-y-1 text-xs text-sub">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span>{e.detail || e.kind}</span>
                <span>{new Date(e.created_at).toLocaleDateString("ar")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
