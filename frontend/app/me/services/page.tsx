"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";

type Service = { id: number; title: string; slug: string; base_price: string; status: string };
type Category = { id: number; name_ar: string };
type Incoming = {
  id: number;
  service_title: string;
  quantity: number;
  total_price: string;
  description: string;
  status: string;
};

const ST_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending_review: "بانتظار المراجعة",
  live: "منشورة",
  paused: "متوقفة",
  archived: "مؤرشفة",
  rejected: "مرفوضة",
};

export default function MyServicesPage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", base_price: "", delivery_days: "5" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, inc] = await Promise.all([
        api<{ results: Service[] }>("/me/services"),
        api<{ results: Incoming[] }>("/me/service-requests?status=pending"),
      ]);
      setServices(s.results);
      setIncoming(inc.results);
    } catch {
      router.replace("/signin");
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load();
    api<Category[] | { results: Category[] }>("/categories")
      .then((d) => setCats(Array.isArray(d) ? d : d.results))
      .catch(() => undefined);
  }, [load, router]);

  async function create() {
    if (!form.title || !form.category || !form.base_price) return;
    setBusy(true);
    try {
      await api("/me/services", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: Number(form.category),
          base_price: form.base_price,
          delivery_days: Number(form.delivery_days),
        }),
      });
      setShow(false);
      setForm({ title: "", description: "", category: "", base_price: "", delivery_days: "5" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function action(id: number, act: string) {
    await api(`/me/services/${id}/${act}`, { method: "POST" }).catch(() => undefined);
    await load();
  }

  async function respond(id: number, act: "accept" | "reject") {
    if (act === "reject") {
      const reason = prompt("سبب الرفض:");
      if (!reason) return;
      await api(`/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }).catch(() => undefined);
    } else {
      await api(`/requests/${id}/accept`, { method: "POST" }).catch(() => undefined);
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">خدماتي</h1>
        <a href="/services" className="text-sm text-primary-dark">تصفّح الخدمات ←</a>
      </div>

      <button className="btn-primary mt-5" onClick={() => setShow((v) => !v)}>
        {show ? "إلغاء" : "+ خدمة جديدة"}
      </button>

      {show && (
        <section className="card mt-4 space-y-3">
          <input className="w-full rounded-m border border-line-strong px-3 py-2 text-sm" placeholder="عنوان الخدمة"
            value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="w-full rounded-m border border-line-strong px-3 py-2 text-sm" rows={3} placeholder="الوصف"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <select className="rounded-m border border-line-strong px-3 py-2 text-sm"
              value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">الفئة…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
            <input className="w-28 rounded-m border border-line-strong px-3 py-2 text-sm" dir="ltr" placeholder="السعر"
              value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
            <input className="w-28 rounded-m border border-line-strong px-3 py-2 text-sm" dir="ltr" placeholder="أيام التسليم"
              value={form.delivery_days} onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} />
          </div>
          <button className="btn-primary" disabled={busy} onClick={create}>نشر الخدمة</button>
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-bold">طلبات شراء واردة</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-m bg-bg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.service_title} × {r.quantity}</span>
                  <span className="font-bold" dir="ltr">${r.total_price}</span>
                </div>
                {r.description && <p className="mt-1 text-sub">{r.description}</p>}
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" onClick={() => respond(r.id, "accept")}>قبول (إنشاء عقد)</button>
                  <button className="btn-secondary" onClick={() => respond(r.id, "reject")}>رفض</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 space-y-2">
        {services.length === 0 ? (
          <div className="rounded-m bg-tint p-8 text-center text-sub">لا خدمات بعد</div>
        ) : (
          services.map((s) => (
            <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{s.title}</p>
                <p className="mt-0.5 text-xs text-sub">{ST_LABEL[s.status]} · <span dir="ltr">${s.base_price}</span></p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {s.status === "live" && <button className="btn-secondary" onClick={() => action(s.id, "pause")}>إيقاف</button>}
                {s.status === "paused" && <button className="btn-secondary" onClick={() => action(s.id, "resume")}>استئناف</button>}
                {(s.status === "draft" || s.status === "rejected") && (
                  <button className="btn-primary" onClick={() => action(s.id, "publish")}>نشر</button>
                )}
                {s.status === "live" && <a className="btn-secondary" href={`/services/${s.slug}`}>عرض</a>}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
