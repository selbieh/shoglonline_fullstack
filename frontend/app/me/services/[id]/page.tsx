"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import ContactHint from "@/components/ContactHint";
import MediaGallery from "@/components/MediaGallery";
import KpiCard from "@/components/KpiCard";
import { DetailRail, RailRow } from "@/components/DetailRail";
import { BarChartIcon, BoltIcon, ClipboardIcon, ClockIcon, GridIcon, WalletIcon } from "@/components/icons";

/* Owner service detail + analytics (ppt slide-20). Hero gallery, the views/orders/conversion KPI
   panel the buyer never sees, the add-ons, status actions, and inline field editing (PATCH /me/services/<id>). */

type Addon = { id: number; title: string; price: string; extra_days: number };
type OwnerService = {
  id: number; title: string; slug: string; status: string;
  description: string; what_you_get?: string; keywords?: string[];
  base_price: string; delivery_days: number; category_name?: string; cover_image?: string;
  addons: Addon[];
  views_count: number; orders_count: number; conversion: number;
};

const ST_LABEL: Record<string, string> = {
  draft: "مسودة", pending_review: "بانتظار المراجعة", live: "منشورة",
  paused: "متوقفة", archived: "مؤرشفة", rejected: "مرفوضة",
};
const ST_CHIP: Record<string, string> = {
  draft: "bg-line/60 text-sub", pending_review: "bg-warn-t text-warn", live: "bg-success-t text-success",
  paused: "bg-warn-t text-warn", archived: "bg-line/60 text-sub", rejected: "bg-danger-t text-danger",
};

export default function OwnerServicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [s, setS] = useState<OwnerService | null>(null);
  const [busy, setBusy] = useState(false);
  // inline edit (ppt slide-20)
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [form, setForm] = useState({ title: "", description: "", what_you_get: "", base_price: "", delivery_days: "", keywords: "" });
  const [addons, setAddons] = useState<{ title: string; price: string; extra_days: string }[]>([]);

  const load = useCallback(async () => {
    try {
      setS(await api<OwnerService>(`/me/services/${params.id}`));
    } catch {
      router.replace(signinHereHref());
    }
  }, [params.id, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    load();
  }, [load, router]);

  async function action(act: string) {
    setBusy(true);
    await api(`/me/services/${params.id}/${act}`, { method: "POST" }).catch(() => undefined);
    await load();
    setBusy(false);
  }

  function startEdit() {
    if (!s) return;
    setForm({
      title: s.title, description: s.description, what_you_get: s.what_you_get ?? "",
      base_price: s.base_price, delivery_days: String(s.delivery_days),
      keywords: (s.keywords ?? []).join("، "),
    });
    setAddons(s.addons.map((a) => ({ title: a.title, price: a.price, extra_days: String(a.extra_days) })));
    setEditMsg("");
    setEdit(true);
  }

  async function saveEdit() {
    setSaving(true);
    setEditMsg("");
    try {
      await api(`/me/services/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          what_you_get: form.what_you_get,
          base_price: form.base_price || "0",
          delivery_days: Number(form.delivery_days) || 0,
          keywords: form.keywords.split(/[,،\n]/).map((k) => k.trim()).filter(Boolean),
          addons: addons
            .filter((a) => a.title.trim())
            .map((a) => ({ title: a.title.trim(), price: a.price || "0", extra_days: Number(a.extra_days) || 0 })),
        }),
      });
      setEdit(false);
      await load();
    } catch (e) {
      setEditMsg(apiError(e).message_ar);
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <a href="/me/services" className="text-sm font-medium text-primary-dark hover:underline">← خدماتي</a>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">{s.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-sub">
            <span className={`chip ${ST_CHIP[s.status] ?? "bg-tint text-primary-dark"}`}>{ST_LABEL[s.status] ?? s.status}</span>
            {s.category_name && <span>{s.category_name}</span>}
            <span dir="ltr" className="font-bold text-primary">${s.base_price}</span>
            <span>· {s.delivery_days.toLocaleString("ar-EG")} يوم</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!edit && <button className="btn-secondary text-sm" onClick={startEdit}>تعديل الخدمة</button>}
          <a href={`/services/${s.slug}`} className="btn-secondary text-sm">معاينة كمشتري</a>
        </div>
      </div>

      {/* analytics KPI panel (owner-only, slide-20) */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard icon={<BarChartIcon />} label="عدد الزيارات" value={s.views_count.toLocaleString("ar-EG")} tone="bg-tint text-primary-dark" />
        <KpiCard icon={<ClipboardIcon />} label="عدد الطلبات" value={s.orders_count.toLocaleString("ar-EG")} tone="bg-success-t text-success" />
        <KpiCard icon={<BoltIcon />} label="معدل التحويل" value={`${s.conversion.toLocaleString("ar-EG")}٪`} tone="bg-warn-t text-warn" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {s.cover_image && <MediaGallery images={[s.cover_image]} alt={s.title} />}
          {edit ? (
            <section className="card space-y-4">
              <h2 className="font-bold text-ink">تعديل الخدمة</h2>
              <label className="block text-sm font-bold">عنوان الخدمة
                <input className="field mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold">السعر الأساسي ($)
                  <input type="number" min={0} className="field mt-1" value={form.base_price}
                    onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
                </label>
                <label className="block text-sm font-bold">مدة التسليم (يوم)
                  <input type="number" min={1} className="field mt-1" value={form.delivery_days}
                    onChange={(e) => setForm({ ...form, delivery_days: e.target.value })} />
                </label>
              </div>
              <label className="block text-sm font-bold">وصف الخدمة
                <textarea className="field mt-1 min-h-28" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
                <ContactHint text={form.description} />
              </label>
              <label className="block text-sm font-bold">ماذا سيحصل عليه المشتري
                <textarea className="field mt-1 min-h-24" value={form.what_you_get}
                  onChange={(e) => setForm({ ...form, what_you_get: e.target.value })} />
                <ContactHint text={form.what_you_get} />
              </label>
              <label className="block text-sm font-bold">كلمات مفتاحية <span className="text-xs font-normal text-sub">(افصل بينها بفاصلة)</span>
                <input className="field mt-1" value={form.keywords} placeholder="تصميم، شعار، هوية"
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
              </label>

              <div>
                <span className="block text-sm font-bold">تطويرات الخدمة (إضافات)</span>
                <div className="mt-2 space-y-2">
                  {addons.map((a, i) => (
                    <div key={i} className="flex flex-wrap gap-2">
                      <input className="field flex-1" placeholder="عنوان الإضافة" value={a.title}
                        onChange={(e) => setAddons(addons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                      <input type="number" min={0} className="field w-24" placeholder="السعر" value={a.price}
                        onChange={(e) => setAddons(addons.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                      <input type="number" min={0} className="field w-24" placeholder="أيام إضافية" value={a.extra_days}
                        onChange={(e) => setAddons(addons.map((x, j) => (j === i ? { ...x, extra_days: e.target.value } : x)))} />
                      <button type="button" className="px-2 text-danger" aria-label="حذف الإضافة"
                        onClick={() => setAddons(addons.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                  <button type="button" className="text-sm font-medium text-primary-dark hover:underline"
                    onClick={() => setAddons([...addons, { title: "", price: "", extra_days: "0" }])}>+ إضافة تطوير</button>
                </div>
              </div>

              {editMsg && <p className="rounded-m bg-danger-t p-3 text-sm text-danger">{editMsg}</p>}
              <div className="flex gap-2">
                <button className="btn-primary disabled:opacity-50" disabled={saving || !form.title.trim()} onClick={saveEdit}>
                  {saving ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                </button>
                <button className="btn-secondary" disabled={saving} onClick={() => setEdit(false)}>إلغاء</button>
              </div>
            </section>
          ) : (
            <>
              <section className="card">
                <h2 className="mb-3 font-bold text-ink">وصف الخدمة</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{s.description}</p>
              </section>
              {s.what_you_get && (
                <section className="card">
                  <h2 className="mb-3 font-bold text-ink">ماذا سيحصل عليه المشتري</h2>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-ink/80">{s.what_you_get}</p>
                </section>
              )}
              {s.keywords && s.keywords.length > 0 && (
                <section className="card">
                  <h2 className="mb-3 font-bold text-ink">كلمات مفتاحية</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {s.keywords.map((k) => <span key={k} className="tag-soft bg-tint text-primary-dark">{k}</span>)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* service info */}
          <DetailRail title="معلومات الخدمة">
            <RailRow icon={<WalletIcon />} label="السعر الأساسي" value={<span dir="ltr">${s.base_price}</span>} />
            <RailRow icon={<ClockIcon />} label="مدة التسليم" value={`${s.delivery_days.toLocaleString("ar-EG")} يوم`} />
            {s.category_name && <RailRow icon={<GridIcon />} label="التصنيف" value={s.category_name} />}
          </DetailRail>

          {/* status actions */}
          <div className="card space-y-2">
            <h2 className="mb-1 text-sm font-bold text-ink">حالة الخدمة</h2>
            {(s.status === "draft" || s.status === "rejected") && (
              <button className="btn-primary w-full" disabled={busy} onClick={() => action("publish")}>نشر الخدمة</button>
            )}
            {s.status === "live" && (
              <button className="btn-secondary w-full" disabled={busy} onClick={() => action("pause")}>إيقاف مؤقت</button>
            )}
            {s.status === "paused" && (
              <button className="btn-primary w-full" disabled={busy} onClick={() => action("resume")}>استئناف</button>
            )}
            {s.status !== "archived" && (
              <button className="w-full rounded-m py-2 text-sm text-danger transition hover:bg-danger-t" disabled={busy} onClick={() => action("archive")}>
                أرشفة الخدمة
              </button>
            )}
          </div>

          {/* add-ons */}
          <div className="card">
            <h2 className="mb-3 text-sm font-bold text-ink">تطويرات الخدمة</h2>
            {s.addons.length === 0 ? (
              <p className="text-sm text-sub">لا توجد تطويرات.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.addons.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                    <span className="min-w-0 truncate">{a.title}</span>
                    <span className="shrink-0 text-sub">
                      <span dir="ltr" className="font-bold text-ink">+${a.price}</span>
                      {a.extra_days > 0 && ` · +${a.extra_days.toLocaleString("ar-EG")} يوم`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
