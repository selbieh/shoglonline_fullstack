"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import ContactHint from "@/components/ContactHint";
import FileUpload from "@/components/FileUpload";
import { TrashIcon } from "@/components/icons";

/* Multi-step "add service" wizard (إضافة خدمة جديدة — ppt slide-19), on the gig keywords /
   what-you-get / add-ons backend. Cover/gallery uploads are URL-only for now (attachment
   upload = follow-up). */

type Cat = { id: number; name_ar: string; children?: Cat[] };
type Addon = { title: string; price: string; extra_days: string };

const STEPS: WizardStep[] = [
  { id: "basic", label: "المعلومات الأساسية" },
  { id: "desc", label: "الوصف" },
  { id: "addons", label: "تطويرات الخدمة", optional: true },
  { id: "review", label: "مراجعة ونشر" },
];

export default function ServiceCreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState<Cat[]>([]);
  const [form, setForm] = useState({
    title: "", category: "", subcategory: "", base_price: "", delivery_days: "5",
    keywords: "", description: "", what_you_get: "", cover_image: "",
  });
  const [addons, setAddons] = useState<Addon[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Cat[] | { results: Cat[] }>("/categories")
      .then((d) => setCats(Array.isArray(d) ? d : d.results))
      .catch(() => undefined);
  }, [router]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const subcats = cats.find((c) => String(c.id) === form.category)?.children ?? [];
  const keywords = form.keywords.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const total = (Number(form.base_price) || 0) + addons.reduce((s, a) => s + (Number(a.price) || 0), 0);

  function addAddon() { setAddons((a) => [...a, { title: "", price: "", extra_days: "" }]); }
  function setAddon(i: number, patch: Partial<Addon>) {
    setAddons((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeAddon(i: number) { setAddons((a) => a.filter((_, j) => j !== i)); }

  async function goNext() {
    setMsg("");
    if (step === 0 && (!form.title || !form.category || !form.base_price)) {
      setMsg("أكمل العنوان والتصنيف والسعر للمتابعة");
      return;
    }
    if (step < STEPS.length - 1) { setStep((s) => s + 1); return; }
    setBusy(true);
    try {
      await api("/me/services", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: Number(form.category),
          subcategory: form.subcategory ? Number(form.subcategory) : null,
          base_price: form.base_price,
          delivery_days: Number(form.delivery_days) || 1,
          cover_image: form.cover_image,
          keywords,
          what_you_get: form.what_you_get,
          addons: addons
            .filter((a) => a.title && a.price)
            .map((a) => ({ title: a.title, price: a.price, extra_days: Number(a.extra_days) || 0 })),
        }),
      });
      router.push("/me/services");
    } catch (e) {
      setMsg(apiError(e).message_ar);
    } finally {
      setBusy(false);
    }
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <main dir="rtl" className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-extrabold">إضافة خدمة جديدة</h1>
          <a href="/me/services" className="text-sm text-primary-dark">← خدماتي</a>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <h2 className="text-xl font-extrabold">{STEPS[step].label}</h2>

        {step === 0 && (
          <div className="mt-6 space-y-5">
            <Field label="عنوان الخدمة">
              <input className="field" value={form.title} placeholder="مثال: تصميم شعار احترافي لشركتك"
                onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="التصنيف">
                <select className="field" value={form.category}
                  onChange={(e) => set({ category: e.target.value, subcategory: "" })}>
                  <option value="">اختر التصنيف</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </Field>
              <Field label="التصنيف الفرعي">
                <select className="field" value={form.subcategory} disabled={!subcats.length}
                  onChange={(e) => set({ subcategory: e.target.value })}>
                  <option value="">{subcats.length ? "اختر التصنيف الفرعي" : "—"}</option>
                  {subcats.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </Field>
              <Field label="سعر الخدمة ($)">
                <input type="number" min={0} className="field" value={form.base_price}
                  placeholder="مثال: 100" onChange={(e) => set({ base_price: e.target.value })} />
              </Field>
              <Field label="مدة التسليم (أيام)">
                <input type="number" min={1} className="field" value={form.delivery_days}
                  onChange={(e) => set({ delivery_days: e.target.value })} />
              </Field>
            </div>
            <Field label="كلمات مفتاحية" hint="افصل بينها بفاصلة">
              <input className="field" value={form.keywords} placeholder="تصميم، شعار، هوية بصرية"
                onChange={(e) => set({ keywords: e.target.value })} />
              {keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {keywords.map((k) => <span key={k} className="tag-soft bg-tint text-primary-dark">{k}</span>)}
                </div>
              )}
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-5">
            <Field label="صورة الخدمة الأساسية (اختياري)">
              <FileUpload accept="image/*" multiple={false} label="ارفع صورة الغلاف"
                onUploaded={(a) => set({ cover_image: a.url })} />
              {form.cover_image && <span className="mt-1 block text-xs text-success">تم تعيين الصورة ✓</span>}
              <p className="mt-2 text-center text-xs text-sub">أو ألصق رابطًا</p>
              <input className="field mt-1" dir="ltr" value={form.cover_image} placeholder="https://…"
                onChange={(e) => set({ cover_image: e.target.value })} />
            </Field>
            <Field label="وصف الخدمة" hint={`${form.description.length.toLocaleString("ar-EG")}/2500`}>
              <textarea className="field min-h-32" maxLength={2500} value={form.description}
                placeholder="اكتب وصفًا تفصيليًا عن خدمتك وما الذي يميزها…"
                onChange={(e) => set({ description: e.target.value })} />
              <ContactHint text={form.description} />
            </Field>
            <Field label="ماذا سيحصل عليه المشتري" hint={`${form.what_you_get.length.toLocaleString("ar-EG")}/1000`}>
              <textarea className="field min-h-24" maxLength={1000} value={form.what_you_get}
                placeholder="اكتب بالتفصيل ما سيحصل عليه العميل عند شراء خدمتك…"
                onChange={(e) => set({ what_you_get: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-sub">أضف تطويرات اختيارية لزيادة قيمة خدمتك (إضافات بسعر ومدة إضافية).</p>
            {addons.map((a, i) => (
              <div key={i} className="card grid gap-3 sm:grid-cols-[1fr,7rem,7rem,auto] sm:items-end">
                <Field label="تفاصيل التطوير">
                  <input className="field" value={a.title} placeholder="مثال: تصميم شعار إضافي"
                    onChange={(e) => setAddon(i, { title: e.target.value })} />
                </Field>
                <Field label="السعر">
                  <input type="number" min={0} className="field" value={a.price}
                    onChange={(e) => setAddon(i, { price: e.target.value })} />
                </Field>
                <Field label="أيام إضافية">
                  <input type="number" min={0} className="field" value={a.extra_days}
                    onChange={(e) => setAddon(i, { extra_days: e.target.value })} />
                </Field>
                <button type="button" onClick={() => removeAddon(i)}
                  className="mb-1 grid h-9 w-9 place-content-center rounded-full text-danger transition hover:bg-danger-t" aria-label="حذف">
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button type="button" onClick={addAddon} className="btn-secondary text-sm">+ إضافة تطوير جديد</button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-4">
            <div className="card space-y-2 text-sm">
              <Row k="عنوان الخدمة" v={form.title || "—"} />
              <Row k="التصنيف" v={cats.find((c) => String(c.id) === form.category)?.name_ar || "—"} />
              <Row k="السعر الأساسي" v={form.base_price ? `$${form.base_price}` : "—"} />
              <Row k="مدة التسليم" v={`${form.delivery_days} أيام`} />
              <Row k="عدد الكلمات المفتاحية" v={keywords.length.toLocaleString("ar-EG")} />
              <Row k="عدد التطويرات" v={addons.filter((a) => a.title && a.price).length.toLocaleString("ar-EG")} />
              <div className="flex items-center justify-between border-t border-line pt-2 font-bold">
                <span>إجمالي السعر مع التطويرات</span>
                <span dir="ltr">${total.toLocaleString("ar-EG")}</span>
              </div>
            </div>
            <p className="text-xs text-sub">سيتم إرسال الخدمة للمراجعة قبل نشرها (حسب إعدادات المنصة).</p>
          </div>
        )}

        {msg && <p className="mt-5 rounded-m bg-danger-t p-3 text-sm text-danger">{msg}</p>}
      </section>

      <footer className="sticky bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="w-full sm:w-64"><WizardStepper steps={STEPS} current={step} percent={pct} /></div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary disabled:opacity-40"
              disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(s - 1, 0))}>السابق</button>
            <button type="button" className="btn-primary disabled:opacity-50" disabled={busy} onClick={goNext}>
              {busy ? "جارٍ النشر…" : step === STEPS.length - 1 ? "نشر الخدمة" : "التالي"}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-sub">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sub">{k}</span>
      <span className="font-medium text-ink">{v}</span>
    </div>
  );
}
