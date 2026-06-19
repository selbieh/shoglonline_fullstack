"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";

type Invoice = {
  id: number;
  number: string;
  worker_email: string;
  employer_email: string;
  period_type: string;
  total: string;
  status: string;
  pdf_url: string;
};
type Contract = { my_role: string; counterpart: { id: number; name: string } };

const ST_LABEL: Record<string, string> = {
  requested: "بانتظار التأكيد",
  confirmed: "مؤكَّدة",
  rejected: "مرفوضة",
};

export default function InvoicesPage() {
  const router = useRouter();
  const [mine, setMine] = useState<Invoice[]>([]);
  const [incoming, setIncoming] = useState<Invoice[]>([]);
  const [employers, setEmployers] = useState<{ id: number; name: string }[]>([]);
  const [employerId, setEmployerId] = useState<number | "">("");
  const [period, setPeriod] = useState("month");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [m, inc, contracts] = await Promise.all([
        api<{ results: Invoice[] }>("/me/invoices"),
        api<{ results: Invoice[] }>("/me/incoming-invoices"),
        api<{ results: Contract[] }>("/me/contracts?role=worker"),
      ]);
      setMine(m.results ?? []);
      setIncoming(inc.results ?? []);
      const uniq = new Map<number, string>();
      (contracts.results ?? []).forEach((c) => uniq.set(c.counterpart.id, c.counterpart.name));
      setEmployers([...uniq].map(([id, name]) => ({ id, name })));
    } catch {
      router.replace(signinHereHref());
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  async function create() {
    if (!employerId) return;
    setMsg("");
    try {
      await api("/invoices", { method: "POST", body: JSON.stringify({ employer_id: employerId, period }) });
      setMsg("✅ أُرسل طلب الفاتورة");
      await load();
    } catch (e) {
      setMsg(`⚠️ ${apiError(e).message_ar}`);
    }
  }

  async function act(id: number, action: "confirm" | "reject") {
    if (action === "reject") {
      const reason = prompt("سبب الرفض:");
      if (!reason) return;
      await api(`/invoices/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }).catch(() => undefined);
    } else {
      await api(`/invoices/${id}/confirm`, { method: "POST" }).catch(() => undefined);
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الفواتير</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      <section className="card mt-5 space-y-3">
        <h2 className="font-bold">طلب فاتورة فترة</h2>
        <div className="flex flex-wrap gap-2">
          <select className="field"
            value={employerId} onChange={(e) => setEmployerId(Number(e.target.value) || "")}>
            <option value="">اختر صاحب العمل…</option>
            {employers.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
          </select>
          <select className="field"
            value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="month">شهري</option>
            <option value="week">أسبوعي</option>
          </select>
          <button className="btn-primary" onClick={create}>طلب الفاتورة</button>
        </div>
        <p className="text-xs text-sub">تُجمّع عقودك المكتملة مع صاحب العمل في الفترة المحددة.</p>
        {msg && <p className="text-sm text-sub">{msg}</p>}
      </section>

      {mine.length > 0 && (
        <section className="card mt-5">
          <h2 className="font-bold">فواتيري</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {mine.map((i) => (
              <li key={i.id} className="flex items-center justify-between rounded-s bg-bg px-3 py-2">
                <span>{i.number} · {i.employer_email}</span>
                <span className="flex items-center gap-2">
                  <span dir="ltr" className="font-bold">${i.total}</span>
                  <span className="text-xs text-sub">{ST_LABEL[i.status]}</span>
                  {i.pdf_url && <a href={i.pdf_url} className="text-xs text-primary-dark" target="_blank" rel="noreferrer">PDF</a>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card mt-5">
          <h2 className="font-bold">فواتير واردة (كصاحب عمل)</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {incoming.map((i) => (
              <li key={i.id} className="rounded-m bg-bg p-3">
                <div className="flex items-center justify-between">
                  <span>{i.number} · {i.worker_email}</span>
                  <span dir="ltr" className="font-bold">${i.total}</span>
                </div>
                {i.status === "requested" ? (
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary" onClick={() => act(i.id, "confirm")}>تأكيد وإصدار PDF</button>
                    <button className="btn-secondary" onClick={() => act(i.id, "reject")}>رفض</button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-sub">{ST_LABEL[i.status]}{i.pdf_url && " · "}
                    {i.pdf_url && <a href={i.pdf_url} className="text-primary-dark" target="_blank" rel="noreferrer">عرض PDF</a>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
