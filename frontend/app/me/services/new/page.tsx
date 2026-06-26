"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError, apiFieldErrors } from "@/lib/errors";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import ContactHint from "@/components/ContactHint";
import FileUpload from "@/components/FileUpload";
import { TrashIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

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

// Which wizard step owns each field — used to jump back to the step holding a
// failed field (whether the failure was caught client-side or returned by the API).
const FIELD_STEP: Record<string, number> = {
  title: 0, category: 0, subcategory: 0, base_price: 0, delivery_days: 0, keywords: 0,
  cover_image: 1, description: 1, what_you_get: 1,
  addons: 2,
};

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
  // Per-field validation messages (keyed by form field) — drives the red outline + inline note.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // When set, the wizard is replaced by a result screen. `pending` = queued for review vs. live.
  const [done, setDone] = useState<{ slug: string; pending: boolean } | null>(null);

  // Published (live) → show the success message briefly, then open the live service page.
  useEffect(() => {
    if (done && !done.pending) {
      const t = setTimeout(() => router.push(`/services/${done.slug}`), 1600);
      return () => clearTimeout(t);
    }
  }, [done, router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Cat[] | { results: Cat[] }>("/categories")
      .then((d) => setCats(Array.isArray(d) ? d : d.results))
      .catch(() => undefined);
  }, [router]);

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    // editing a field clears its (and only its) error so the red mark goes away as you type
    setErrors((e) => {
      if (!Object.keys(patch).some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };
  const subcats = cats.find((c) => String(c.id) === form.category)?.children ?? [];
  const keywords = form.keywords.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
  const total = (Number(form.base_price) || 0) + addons.reduce((s, a) => s + (Number(a.price) || 0), 0);

  function addAddon() { setAddons((a) => [...a, { title: "", price: "", extra_days: "" }]); }
  function setAddon(i: number, patch: Partial<Addon>) {
    setAddons((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function removeAddon(i: number) { setAddons((a) => a.filter((_, j) => j !== i)); }

  // Required-field rules, keyed by field. Returns "" when the field is OK.
  function errorFor(field: string): string {
    switch (field) {
      case "title": return form.title.trim() ? "" : "أدخل عنوان الخدمة";
      case "category": return form.category ? "" : "اختر التصنيف";
      case "base_price":
        return form.base_price && Number(form.base_price) > 0 ? "" : "أدخل سعرًا أكبر من صفر";
      case "delivery_days":
        return (Number(form.delivery_days) || 0) >= 1 ? "" : "أدخل مدة تسليم لا تقل عن يوم";
      case "description":
        if (!form.description.trim()) return "اكتب وصفًا تفصيليًا للخدمة";
        return form.description.trim().length >= 30 ? "" : "الوصف قصير جدًا — اكتب 30 حرفًا على الأقل";
      default: return "";
    }
  }

  // Fields enforced when leaving each step; the review step (last) re-checks them all.
  const STEP_REQUIRED: string[][] = [
    ["title", "category", "base_price", "delivery_days"],
    ["description"],
    [],
    ["title", "category", "base_price", "delivery_days", "description"],
  ];

  function validate(fields: string[]): Record<string, string> {
    const found: Record<string, string> = {};
    for (const f of fields) {
      const m = errorFor(f);
      if (m) found[f] = m;
    }
    return found;
  }

  async function goNext() {
    setMsg("");
    const isFinal = step === STEPS.length - 1;
    const found = validate(STEP_REQUIRED[step]);
    if (Object.keys(found).length) {
      setErrors(found);
      // jump to the earliest step that has a problem (matters on the review step)
      setStep(Math.min(...Object.keys(found).map((k) => FIELD_STEP[k] ?? step)));
      setMsg("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      return;
    }
    setErrors({});
    if (!isFinal) { setStep((s) => s + 1); return; }
    setBusy(true);
    try {
      const created = await api<{ slug: string; status: string }>("/me/services", {
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
      // live → published immediately; anything else (pending_review) waits for admin approval.
      setDone({ slug: created.slug, pending: created.status !== "live" });
    } catch (e) {
      // Surface field-level validation from the API: mark each input and jump to its step.
      const fieldErrors = apiFieldErrors(e);
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors);
        setStep(Math.min(...Object.keys(fieldErrors).map((k) => FIELD_STEP[k] ?? step)));
        setMsg("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
      } else {
        setMsg(apiError(e).message_ar);
      }
    } finally {
      setBusy(false);
    }
  }

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  // Result screen — replaces the wizard once the service is submitted.
  if (done) {
    return (
      <main dir="rtl" className="mx-auto max-w-2xl px-6 py-16">
        <div className="card flex flex-col items-center gap-5 py-12 text-center">
          <span className="grid h-20 w-20 place-content-center rounded-full bg-success-t text-3xl text-success">
            {done.pending ? "📝" : "🎉"}
          </span>
          <h1 className="text-2xl font-extrabold">
            {done.pending ? "تم الإرسال للمراجعة" : "تم نشر الخدمة بنجاح"}
          </h1>
          <p className="max-w-md text-sub">
            {done.pending
              ? "أُرسلت خدمتك لمراجعة الإدارة — ستظهر للعملاء فور الموافقة عليها."
              : "أصبحت خدمتك ظاهرة للعملاء. جارٍ تحويلك إلى صفحة الخدمة…"}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a href="/me/services" className="btn-secondary px-6 py-3">← خدماتي</a>
            {!done.pending && (
              <a href={`/services/${done.slug}`} className="btn-primary px-6 py-3">عرض الخدمة</a>
            )}
          </div>
        </div>
      </main>
    );
  }

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
            <Field label="عنوان الخدمة" error={errors.title}>
              <input className="field" value={form.title} placeholder="مثال: تصميم شعار احترافي لشركتك"
                onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="التصنيف" error={errors.category}>
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
              <Field label="سعر الخدمة (بالدولار الأمريكي)" error={errors.base_price}>
                <input type="number" min={0} className="field" value={form.base_price}
                  placeholder="مثال: 100" onChange={(e) => set({ base_price: e.target.value })} />
              </Field>
              <Field label="مدة التسليم (أيام)" error={errors.delivery_days}>
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
                hint="يُفضَّل صورة أفقية بنسبة 16:9 (مثل 1280×720 بكسل) لتظهر البطاقة بشكل مثالي دون اقتطاع"
                onUploaded={(a) => set({ cover_image: a.url })} />
              {form.cover_image && (
                <div className="relative mt-2 overflow-hidden rounded-m border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.cover_image} alt="معاينة صورة الغلاف"
                    className="aspect-video w-full bg-tint object-cover" />
                  <button type="button" onClick={() => set({ cover_image: "" })}
                    className="absolute end-2 top-2 grid h-8 w-8 place-content-center rounded-full bg-white/90 text-danger shadow transition hover:bg-white"
                    aria-label="إزالة الصورة">
                    <TrashIcon />
                  </button>
                  <span className="absolute bottom-2 start-2 rounded-full bg-success-t px-2 py-0.5 text-xs text-success">تم تعيين الصورة ✓</span>
                </div>
              )}
              <p className="mt-2 text-center text-xs text-sub">أو ألصق رابطًا</p>
              <input className="field mt-1" dir="ltr" value={form.cover_image} placeholder="https://…"
                onChange={(e) => set({ cover_image: e.target.value })} />
            </Field>
            <Field label="وصف الخدمة" error={errors.description} hint={`حد أدنى 30 حرفًا · ${form.description.length.toLocaleString("en-US")}/2500`}>
              <textarea className="field min-h-32" maxLength={2500} value={form.description}
                placeholder="اكتب وصفًا تفصيليًا عن خدمتك وما الذي يميزها…"
                onChange={(e) => set({ description: e.target.value })} />
              <ContactHint text={form.description} mode="review" />
            </Field>
            <Field label="ماذا سيحصل عليه المشتري" hint={`${form.what_you_get.length.toLocaleString("en-US")}/1000`}>
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
                <Field label="السعر (بالدولار الأمريكي)">
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
              <Row k="السعر الأساسي" v={form.base_price ? formatUSD(form.base_price) : "—"} />
              <Row k="مدة التسليم" v={`${form.delivery_days} أيام`} />
              <Row k="عدد الكلمات المفتاحية" v={keywords.length.toLocaleString("en-US")} />
              <Row k="عدد التطويرات" v={addons.filter((a) => a.title && a.price).length.toLocaleString("en-US")} />
              <div className="flex items-center justify-between border-t border-line pt-2 font-bold">
                <span>إجمالي السعر مع التطويرات</span>
                <span>{formatUSD(total)}</span>
              </div>
            </div>
            <p className="text-xs text-sub">سيتم إرسال الخدمة للمراجعة قبل نشرها (حسب إعدادات المنصة).</p>
          </div>
        )}

        {msg && <p className="mt-5 rounded-m bg-danger-t p-3 text-sm text-danger">{msg}</p>}
      </section>

      <footer className="sticky bottom-0 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="w-full sm:w-64"><WizardStepper steps={STEPS} current={step} percent={pct} completionSubject="خدمتك جاهزة" /></div>
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

function Field({ label, hint, error, children }:
  { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={`block ${error ? "[&_.field]:border-danger [&_.field]:ring-1 [&_.field]:ring-danger" : ""}`}>
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-sub">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
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
