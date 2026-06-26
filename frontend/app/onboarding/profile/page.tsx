"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { useFieldErrors, validateFields, earliestStep, type Rule } from "@/lib/useFieldErrors";
import { fetchPublicSettings, phoneVerifyEnabled } from "@/lib/settings";
import { digitsOnly } from "@/lib/arabic";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { LockIcon } from "@/components/icons";
import Logo from "@/components/Logo";
import Field from "@/components/Field";
import FileUpload from "@/components/FileUpload";
import ContactHint from "@/components/ContactHint";
import SkillPicker from "@/components/SkillPicker";
import WizardStepper, { type WizardStep } from "@/components/WizardStepper";
import { formatUSD } from "@/lib/currency";

/* Freelancer profile setup wizard (تهيئة الحساب — ppt slides 02–11). Full deck parity: personal data
   (incl. a REQUIRED private contact method, slide-02 — stored for the platform, never shown publicly),
   work + skills, portfolio, certificates, pricing, verification, and review/publish. Built on the
   existing data layer (PATCH /me/profile, /me/portfolio, /me/certificates, phone-OTP, publish). */

type Draft = {
  display_name: string;
  avatar_url: string;
  intro_video: string;
  overview: string;
  bio_title: string;
  main_category: string;
  specialization: string;
  expertise_level: string;
  years_experience: string;
  hourly_rate: string;
  availability: string;
  weekly_hours: string;
  client_notes: string;
  private_contact_channel: string;
  private_contact_value: string;
};
type Lang = { name: string; proficiency: string };
type Skill = { skill_id: number; name: string; efficiency: string };
type CatalogSkill = { id: number; name_ar: string };
type Category = { id: number; name_ar: string; children: Category[] };
type PfItem = { id: number; title: string; cover_url?: string; image_url?: string };
type CertItem = { id: number; name: string; issuer?: string };

type Me = { id?: number; email: string; email_verified: boolean; phone_verified: boolean; avatar_url: string };

const EMPTY: Draft = {
  display_name: "", avatar_url: "", intro_video: "", overview: "", bio_title: "",
  main_category: "", specialization: "", expertise_level: "",
  years_experience: "", hourly_rate: "", availability: "available_now",
  weekly_hours: "", client_notes: "",
  private_contact_channel: "whatsapp", private_contact_value: "",
};

const PROF = [
  { v: "basic", l: "أساسي" },
  { v: "advanced", l: "متقدم" },
  { v: "native", l: "اللغة الأم" },
];

// ppt slide-02: a required external contact, kept PRIVATE (platform/admin only — never shown on profile).
const CONTACT_CHANNELS = [
  { v: "whatsapp", l: "واتساب" },
  { v: "phone", l: "هاتف" },
  { v: "email", l: "بريد إلكتروني" },
  { v: "telegram", l: "تيليجرام" },
];

// ppt slide-04: skill efficiency levels (matches WorkerSkill.Efficiency).
const EFF_OPTS = [
  { v: "beginner", l: "مبتدئ" },
  { v: "intermediate", l: "متوسط" },
  { v: "advanced", l: "متقدم" },
  { v: "expert", l: "خبير" },
];

const STEPS: WizardStep[] = [
  { id: "personal", label: "البيانات الشخصية" },
  { id: "work", label: "العمل والمهارات" },
  { id: "portfolio", label: "معرض الأعمال", optional: true },
  { id: "certificates", label: "الشهادات والتدريب", optional: true },
  { id: "details", label: "تفاصيل العمل" },
  { id: "verify", label: "التحقق", optional: true },
  { id: "review", label: "المراجعة والنشر" },
];
// step indices (keep goNext / stepError readable)
const S_PERSONAL = 0, S_WORK = 1, S_PORTFOLIO = 2, S_CERTS = 3, S_DETAILS = 4, S_VERIFY = 5, S_REVIEW = 6;
const MANDATORY = [S_PERSONAL, S_WORK, S_DETAILS];

const LEVELS = [
  { v: "entry", l: "مبتدئ" },
  { v: "intermediate", l: "متوسط" },
  { v: "expert", l: "خبير" },
];

const AVAIL = [
  { v: "available_now", t: "متاح الآن", d: "يمكنني البدء بالعمل فورًا" },
  { v: "available_soon", t: "متاح قريبًا", d: "يمكنني البدء خلال وقت قصير" },
  { v: "unavailable", t: "غير متاح حاليًا", d: "غير متاح للعمل حاليًا" },
];

const EMPTY_PF = {
  title: "", project_type: "", cover_url: "", description: "", project_link: "",
  skills: "", duration_value: "", duration_unit: "month", completed_at: "",
};
const EMPTY_CERT = {
  name: "", issuer: "", cert_type: "", issued_year: "", expiry_year: "", no_expiry: false,
  credential_id: "", verification_link: "", skills: "",
};

export default function ProfileWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [languages, setLanguages] = useState<Lang[]>([]);
  const [langDraft, setLangDraft] = useState<Lang>({ name: "", proficiency: "basic" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [me, setMe] = useState<Me>({ email: "", email_verified: false, phone_verified: false, avatar_url: "" });
  const { errors, setErrors, clearFields, formError, setFormError, applyApiError } = useFieldErrors();
  const [busy, setBusy] = useState(false);
  // skills (slide-04)
  const [catalog, setCatalog] = useState<CatalogSkill[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  // portfolio (slide-07)
  const [portfolio, setPortfolio] = useState<PfItem[]>([]);
  const [pf, setPf] = useState(EMPTY_PF);
  const [pfCover, setPfCover] = useState<number | null>(null);
  const [pfOwnership, setPfOwnership] = useState(false);
  const [pfBusy, setPfBusy] = useState(false);
  const [pfMsg, setPfMsg] = useState("");
  // certificates (slide-06/08)
  const [certificates, setCertificates] = useState<CertItem[]>([]);
  const [cert, setCert] = useState(EMPTY_CERT);
  const [certFile, setCertFile] = useState<number | null>(null);
  const [certBusy, setCertBusy] = useState(false);
  const [certMsg, setCertMsg] = useState("");
  // verification step
  const [cc, setCc] = useState("+966");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [vmsg, setVmsg] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerifyOn, setPhoneVerifyOn] = useState(false);
  // ID verification (slide-08/10)
  const [idStatus, setIdStatus] = useState("none");
  const [docType, setDocType] = useState("national_id");
  const [idFiles, setIdFiles] = useState<{ front?: number; back?: number; selfie?: number }>({});
  const [idConsent, setIdConsent] = useState(false);
  const [idBusy, setIdBusy] = useState(false);
  const [idMsg, setIdMsg] = useState("");
  // review step
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Record<string, unknown>>("/me/profile")
      .then((p) => {
        setDraft((d) => ({
          ...d,
          display_name: String(p.display_name ?? ""),
          intro_video: String(p.intro_video ?? ""),
          overview: String(p.overview ?? ""),
          bio_title: String(p.bio_title ?? ""),
          main_category: p.main_category != null ? String(p.main_category) : "",
          specialization: p.specialization != null ? String(p.specialization) : "",
          expertise_level: String(p.expertise_level ?? ""),
          years_experience: p.years_experience != null ? String(p.years_experience) : "",
          hourly_rate: p.hourly_rate != null ? String(p.hourly_rate) : "",
          availability: String(p.availability ?? "available_now"),
          weekly_hours: p.weekly_hours != null ? String(p.weekly_hours) : "",
          client_notes: String(p.client_notes ?? ""),
          private_contact_channel: String(p.private_contact_channel || "whatsapp"),
          private_contact_value: String(p.private_contact_value ?? ""),
        }));
        if (Array.isArray(p.languages)) setLanguages(p.languages as Lang[]);
        if (Array.isArray(p.skills)) setSkills(p.skills as Skill[]);
        if (Array.isArray(p.portfolio)) setPortfolio(p.portfolio as PfItem[]);
        if (Array.isArray(p.certificates)) setCertificates(p.certificates as CertItem[]);
      })
      .catch(() => {});
    api<Me>("/auth/me")
      .then((u) => {
        setMe({ id: u.id, email: u.email, email_verified: !!u.email_verified, phone_verified: !!u.phone_verified, avatar_url: u.avatar_url || "" });
        setDraft((d) => ({ ...d, avatar_url: u.avatar_url || "" }));
        setPhoneVerified(!!u.phone_verified);
      })
      .catch(() => {});
    api<Category[]>("/categories").then(setCategories).catch(() => {});
    api<CatalogSkill[] | { results: CatalogSkill[] }>("/skills")
      .then((s) => setCatalog(Array.isArray(s) ? s : s?.results ?? [])).catch(() => {});
    api<{ status: string }>("/me/id-verification").then((v) => setIdStatus(v.status)).catch(() => {});
    fetchPublicSettings().then((s) => setPhoneVerifyOn(phoneVerifyEnabled(s))).catch(() => {});
  }, [router]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    clearFields(...Object.keys(patch));
  };

  // Which mandatory step owns each draft field — used to bounce back to the step holding a
  // failed field (client-side gate OR a field-keyed error returned by PATCH /me/profile).
  const FIELD_STEP: Record<string, number> = {
    display_name: S_PERSONAL, overview: S_PERSONAL, intro_video: S_PERSONAL,
    private_contact_channel: S_PERSONAL, private_contact_value: S_PERSONAL,
    bio_title: S_WORK, main_category: S_WORK, specialization: S_WORK,
    expertise_level: S_WORK, years_experience: S_WORK, skills: S_WORK, languages: S_WORK,
    hourly_rate: S_DETAILS, availability: S_DETAILS, weekly_hours: S_DETAILS, client_notes: S_DETAILS,
  };
  // Required fields enforced when leaving each mandatory step (ppt slide-2/10 — no skip).
  const STEP_REQUIRED: Record<number, string[]> = {
    [S_PERSONAL]: ["display_name", "overview", "private_contact_channel", "private_contact_value"],
    [S_WORK]: ["bio_title", "main_category", "expertise_level"],
    [S_DETAILS]: ["hourly_rate", "availability"],
  };
  const RULES: Record<string, Rule> = {
    display_name: () => (draft.display_name.trim() ? "" : "الاسم الظاهر للعملاء مطلوب"),
    overview: () => (draft.overview.trim() ? "" : "النبذة القصيرة عنك مطلوبة"),
    private_contact_channel: () => (draft.private_contact_channel ? "" : "اختر وسيلة التواصل"),
    private_contact_value: () => (draft.private_contact_value.trim() ? "" : "أدخل وسيلة تواصل واحدة على الأقل"),
    bio_title: () => (draft.bio_title.trim() ? "" : "المسمى الوظيفي مطلوب"),
    main_category: () => (draft.main_category ? "" : "اختر المجال الرئيسي"),
    expertise_level: () => (draft.expertise_level ? "" : "اختر مستوى الخبرة"),
    hourly_rate: () => (draft.hourly_rate.trim() ? "" : "سعر الساعة مطلوب"),
    availability: () => (draft.availability ? "" : "اختر حالة التوفر للعمل"),
  };

  const core = [draft.display_name, draft.overview, draft.bio_title, draft.expertise_level, draft.hourly_rate, draft.availability, skills.length ? "1" : ""];
  const pct = Math.round((core.filter(Boolean).length / core.length) * 100);
  const selectedCat = categories.find((c) => String(c.id) === draft.main_category);
  const specs = selectedCat?.children ?? [];
  const availableSkills = catalog.filter((c) => !skills.some((s) => s.skill_id === c.id));

  async function saveProfile() {
    await api("/auth/me", { method: "PATCH", body: JSON.stringify({ avatar_url: draft.avatar_url || "" }) });
    await api("/me/profile", {
      method: "PATCH",
      body: JSON.stringify({
        display_name: draft.display_name,
        intro_video: draft.intro_video,
        overview: draft.overview,
        bio_title: draft.bio_title,
        main_category: draft.main_category ? Number(draft.main_category) : null,
        specialization: draft.specialization ? Number(draft.specialization) : null,
        expertise_level: draft.expertise_level || "",
        years_experience: draft.years_experience ? Number(draft.years_experience) : null,
        hourly_rate: draft.hourly_rate || null,
        availability: draft.availability || "available_now",
        weekly_hours: draft.weekly_hours ? Number(draft.weekly_hours) : null,
        client_notes: draft.client_notes,
        private_contact_channel: draft.private_contact_channel || "",
        private_contact_value: draft.private_contact_value,
        languages,
        skills: skills.map((s) => ({ skill_id: s.skill_id, efficiency: s.efficiency })),
      }),
    });
  }

  // Map a thrown API error to its inputs and bounce to the step that owns the first failure.
  function handleApiError(e: unknown) {
    const keys = applyApiError(e);
    if (keys.length) {
      setStep(earliestStep(keys, FIELD_STEP, step));
      setFormError("يرجى تصحيح الحقول المظلَّلة بالأحمر أدناه");
    }
  }

  async function saveAndExit() {
    setBusy(true);
    setFormError("");
    try {
      await saveProfile();
      router.push("/me/profile");
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    setFormError("");
    // ppt slide-2/10: block leaving a mandatory step until its required fields are valid.
    if (MANDATORY.includes(step)) {
      const found = validateFields(RULES, STEP_REQUIRED[step] ?? []);
      if (Object.keys(found).length) {
        setErrors(found);
        setFormError("يرجى تعبئة الحقول الإلزامية المظلَّلة بالأحمر.");
        return;
      }
    }
    setErrors({});
    setBusy(true);
    try {
      if (step === S_REVIEW) {
        await saveProfile();
        const res = await api<{ publish_state: string }>("/me/profile/publish", { method: "POST" });
        // published → open the public profile; pending_review → owner page shows the review badge.
        if (res.publish_state === "published" && me.id) {
          router.push(`/freelancers/${me.id}`);
        } else {
          router.push("/me/profile");
        }
        return;
      }
      // persist draft when leaving a step that edits it; portfolio/certs/verify save via their own endpoints.
      if (MANDATORY.includes(step)) await saveProfile();
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  // Pick-to-add: selecting a skill in the picker adds it immediately (matches the /me/profile
  // skills editor). Default level is "intermediate" and is adjustable inline on each chip.
  function addSkill(id: number) {
    const item = catalog.find((c) => c.id === id);
    if (!item) return;
    setSkills((list) =>
      list.some((s) => s.skill_id === id) ? list : [...list, { skill_id: id, name: item.name_ar, efficiency: "intermediate" }],
    );
  }

  function setSkillEfficiency(id: number, efficiency: string) {
    setSkills((list) => list.map((s) => (s.skill_id === id ? { ...s, efficiency } : s)));
  }

  async function addPortfolio() {
    if (!pf.title.trim()) { setPfMsg("أدخل عنوان العمل"); return; }
    if (!pfOwnership) { setPfMsg("يجب تأكيد ملكيتك للعمل قبل الإضافة"); return; }
    setPfBusy(true);
    setPfMsg("");
    try {
      const skillsArr = pf.skills.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
      const item = await api<PfItem>("/me/portfolio", {
        method: "POST",
        body: JSON.stringify({
          title: pf.title,
          description: pf.description,
          media_type: pf.cover_url ? "image" : pf.project_link ? "link" : "image",
          url: pf.cover_url || pf.project_link,
          cover_url: pf.cover_url,
          project_type: pf.project_type,
          project_link: pf.project_link,
          duration_value: pf.duration_value ? Number(pf.duration_value) : null,
          duration_unit: pf.duration_value ? pf.duration_unit : "",
          skills: skillsArr,
          completed_at: pf.completed_at || null,
          ownership_confirmed: pfOwnership,
          attachment_ids: pfCover ? [pfCover] : undefined,
        }),
      });
      setPortfolio((list) => [...list, item]);
      setPf(EMPTY_PF); setPfCover(null); setPfOwnership(false);
      setPfMsg("تمت إضافة العمل ✓");
    } catch (e) {
      setPfMsg(apiError(e).message_ar);
    } finally {
      setPfBusy(false);
    }
  }

  async function removePortfolio(id: number) {
    await api(`/me/portfolio/${id}`, { method: "DELETE" }).catch(() => undefined);
    setPortfolio((list) => list.filter((p) => p.id !== id));
  }

  async function addCertificate() {
    if (!cert.name.trim()) { setCertMsg("أدخل اسم الشهادة"); return; }
    setCertBusy(true);
    setCertMsg("");
    try {
      const skillsArr = cert.skills.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
      const item = await api<CertItem>("/me/certificates", {
        method: "POST",
        body: JSON.stringify({
          name: cert.name,
          issuer: cert.issuer,
          cert_type: cert.cert_type,
          issued_year: cert.issued_year ? Number(cert.issued_year) : null,
          expiry_year: cert.no_expiry || !cert.expiry_year ? null : Number(cert.expiry_year),
          no_expiry: cert.no_expiry,
          credential_id: cert.credential_id,
          verification_link: cert.verification_link,
          skills: skillsArr,
          attachment_ids: certFile ? [certFile] : undefined,
        }),
      });
      setCertificates((list) => [...list, item]);
      setCert(EMPTY_CERT); setCertFile(null);
      setCertMsg("تمت إضافة الشهادة ✓");
    } catch (e) {
      setCertMsg(apiError(e).message_ar);
    } finally {
      setCertBusy(false);
    }
  }

  async function removeCertificate(id: number) {
    await api(`/me/certificates/${id}`, { method: "DELETE" }).catch(() => undefined);
    setCertificates((list) => list.filter((c) => c.id !== id));
  }

  async function submitIdVerification() {
    const ids = [idFiles.front, idFiles.back, idFiles.selfie].filter(Boolean) as number[];
    if (ids.length === 0) { setIdMsg("ارفع صورة الهوية أولًا"); return; }
    if (!idConsent) { setIdMsg("يجب الموافقة على معالجة بيانات الهوية"); return; }
    setIdBusy(true);
    setIdMsg("");
    try {
      const v = await api<{ status: string }>("/me/id-verification", {
        method: "POST",
        body: JSON.stringify({ attachment_ids: ids, doc_type: docType, consent: idConsent }),
      });
      setIdStatus(v.status);
      setIdMsg("تم إرسال هويتك للمراجعة ✓");
    } catch (e) {
      setIdMsg(apiError(e).message_ar);
    } finally {
      setIdBusy(false);
    }
  }

  async function requestOtp() {
    setOtpBusy(true);
    setVmsg("");
    try {
      const r = await api<{ sent: boolean; debug_code?: string }>("/auth/phone/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone: `${cc}${phone}` }),
      });
      setOtpSent(true);
      setVmsg(r.debug_code ? `رمز التطوير: ${r.debug_code}` : "تم إرسال الرمز إلى جوالك");
    } catch (e) {
      setVmsg(apiError(e).message_ar);
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtp() {
    setOtpBusy(true);
    setVmsg("");
    try {
      await api("/auth/phone/verify-otp", { method: "POST", body: JSON.stringify({ code }) });
      setPhoneVerified(true);
      setVmsg("تم التحقق من رقم الجوال ✓");
    } catch (e) {
      setVmsg(apiError(e).message_ar);
    } finally {
      setOtpBusy(false);
    }
  }

  const phoneOk = phoneVerified || me.phone_verified;
  // rule D-1: publishing now submits the profile for admin review (not instant publish).
  const primaryLabel = busy ? "جارٍ الحفظ…" : step === S_REVIEW ? "إرسال للمراجعة" : "التالي";
  // Hide the sticky bottom bar while the mobile keyboard is open so it never overlaps the focused field.
  const keyboardOpen = useKeyboardOpen();

  return (
    <main dir="rtl" className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Logo className="h-9 w-auto" href="/" />
          <div className="text-left">
            <p className="font-bold text-ink">تهيئة الحساب</p>
            <p className="text-xs text-sub">تساعد هذه المعلومات على زيادة فرص حصولك على الأعمال.</p>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-extrabold">{STEPS[step].label}</h1>

        {step === S_PERSONAL && (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-content-center overflow-hidden rounded-full bg-tint text-lg font-bold text-primary-dark">
                {draft.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={draft.avatar_url} alt="" className="h-full w-full object-cover" />
                  : (draft.display_name?.[0] ?? "؟")}
              </div>
              <div className="flex-1">
                <span className="mb-1 block text-sm font-medium text-ink">الصورة الشخصية</span>
                <FileUpload accept="image/*" multiple={false} label="رفع صورة"
                  hint="يُفضَّل صورة مربعة (مثل 512×512 بكسل) لأن الصورة الشخصية تظهر داخل دائرة"
                  onUploaded={(a) => set({ avatar_url: a.url })} />
              </div>
            </div>
            <Field label="الاسم الظاهر للعملاء" required error={errors.display_name}>
              <input className="field" value={draft.display_name} placeholder="مثال: أحمد محمد"
                onChange={(e) => set({ display_name: e.target.value })} />
            </Field>
            <Field label="نبذة قصيرة عنك" required error={errors.overview} hint={`${draft.overview.length.toLocaleString("en-US")}/500`}>
              <textarea className="field min-h-28" maxLength={500} value={draft.overview}
                placeholder="اكتب نبذة مختصرة عنك، خبراتك، وما يميزك عن غيرك من المستقلين…"
                onChange={(e) => set({ overview: e.target.value })} />
              <ContactHint text={draft.overview} mode="review" />
            </Field>
            <Field label="رابط فيديو تعريفي (اختياري)">
              <input className="field" dir="ltr" placeholder="https://… (يوتيوب/فيميو)" value={draft.intro_video}
                onChange={(e) => set({ intro_video: e.target.value })} />
            </Field>

            {/* ppt slide-02: REQUIRED private contact — for the platform only, never shown on the profile */}
            <Field label="وسيلة تواصل" required error={errors.private_contact_channel || errors.private_contact_value}>
              <div className="flex flex-wrap gap-2">
                <select className="field w-36" value={draft.private_contact_channel} aria-label="نوع وسيلة التواصل"
                  onChange={(e) => set({ private_contact_channel: e.target.value })}>
                  {CONTACT_CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
                <input className="field flex-1" dir="ltr" value={draft.private_contact_value}
                  placeholder={draft.private_contact_channel === "email" ? "name@example.com" : "+9665…"}
                  onChange={(e) => set({ private_contact_value: e.target.value })} />
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-sub">
                <LockIcon aria-hidden className="inline-block align-[-2px] text-[14px]" /> للمنصة فقط — لن تظهر هذه الوسيلة في ملفك العام إطلاقًا.
              </p>
            </Field>
          </div>
        )}

        {step === S_WORK && (
          <div className="mt-6 space-y-5">
            <Field label="المسمى الوظيفي" required error={errors.bio_title}>
              <input className="field" value={draft.bio_title} placeholder="مثال: مصمم واجهات مستخدم"
                onChange={(e) => set({ bio_title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="المجال الرئيسي" required error={errors.main_category}>
                <select className="field" value={draft.main_category}
                  onChange={(e) => set({ main_category: e.target.value, specialization: "" })}>
                  <option value="">اختر المجال…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </Field>
              <Field label="التخصص">
                <select className="field" value={draft.specialization} disabled={specs.length === 0}
                  onChange={(e) => set({ specialization: e.target.value })}>
                  <option value="">{specs.length ? "اختر التخصص…" : "اختر المجال أولًا"}</option>
                  {specs.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </Field>
            </div>
            <Field label="مستوى الخبرة" required error={errors.expertise_level}>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map(({ v, l }) => (
                  <button key={v} type="button"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${draft.expertise_level === v ? "bg-primary text-white" : "bg-tint text-primary-dark hover:bg-primary/10"}`}
                    onClick={() => set({ expertise_level: v })}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label="سنوات الخبرة">
              <input type="number" min={0} className="field" value={draft.years_experience}
                placeholder="مثال: 5" onChange={(e) => set({ years_experience: e.target.value })} />
            </Field>

            {/* ppt slide-04: skills with efficiency level — pick to add, adjust the level inline on each chip */}
            <Field label="المهارات">
              <div className="space-y-2">
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span key={s.skill_id} className="inline-flex items-center gap-1.5 rounded-full bg-tint py-1 pe-3 ps-1 text-sm text-primary-dark">
                        <button type="button" aria-label={`حذف ${s.name}`}
                          className="grid h-5 w-5 place-content-center rounded-full text-danger hover:bg-danger/10"
                          onClick={() => setSkills(skills.filter((x) => x.skill_id !== s.skill_id))}>×</button>
                        <span className="font-medium">{s.name}</span>
                        <select aria-label={`مستوى ${s.name}`} value={s.efficiency}
                          className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-sub"
                          onChange={(e) => setSkillEfficiency(s.skill_id, e.target.value)}>
                          {EFF_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </span>
                    ))}
                  </div>
                )}
                <SkillPicker
                  options={availableSkills}
                  value=""
                  placeholder="اختر مهارة لإضافتها…"
                  onSelect={addSkill}
                />
                {availableSkills.length === 0 && skills.length > 0 && (
                  <p className="text-xs text-sub">أضفت كل المهارات المتاحة.</p>
                )}
              </div>
            </Field>

            <Field label="اللغات">
              <div className="space-y-2">
                {languages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {languages.map((l, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-tint px-3 py-1 text-sm">
                        {l.name} <span className="text-xs text-sub">({PROF.find((p) => p.v === l.proficiency)?.l})</span>
                        <button type="button" aria-label={`حذف ${l.name}`} className="text-danger"
                          onClick={() => setLanguages(languages.filter((_, j) => j !== i))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <input className="field grow basis-full sm:basis-0" placeholder="اللغة (مثال: العربية)" value={langDraft.name}
                    onChange={(e) => setLangDraft({ ...langDraft, name: e.target.value })} />
                  <select className="field w-32" value={langDraft.proficiency} aria-label="مستوى اللغة"
                    onChange={(e) => setLangDraft({ ...langDraft, proficiency: e.target.value })}>
                    {PROF.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                  <button type="button" className="btn-secondary whitespace-nowrap" disabled={!langDraft.name.trim()}
                    onClick={() => { setLanguages([...languages, langDraft]); setLangDraft({ name: "", proficiency: "basic" }); }}>
                    إضافة لغة
                  </button>
                </div>
              </div>
            </Field>
          </div>
        )}

        {step === S_PORTFOLIO && (
          <div className="mt-6 space-y-5">
            <p className="text-sm text-sub">اعرض أفضل أعمالك (اختياري — يمكنك التخطي والإضافة لاحقًا).</p>
            {portfolio.length > 0 && (
              <ul className="space-y-2">
                {portfolio.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-m border border-line bg-white p-3">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{p.title}</span>
                    <button type="button" className="text-xs font-medium text-danger" onClick={() => removePortfolio(p.id)}>حذف</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-l border border-line bg-white p-4">
              <p className="mb-3 text-sm font-bold text-ink">إضافة عمل</p>
              <div className="space-y-4">
                <Field label="عنوان العمل">
                  <input className="field" value={pf.title} placeholder="عنوان واضح ومختصر"
                    onChange={(e) => setPf({ ...pf, title: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="نوع المشروع">
                    <input className="field" value={pf.project_type} placeholder="مثال: تصميم واجهات"
                      onChange={(e) => setPf({ ...pf, project_type: e.target.value })} />
                  </Field>
                  <Field label="رابط المشروع (اختياري)">
                    <input className="field" dir="ltr" value={pf.project_link} placeholder="https://…"
                      onChange={(e) => setPf({ ...pf, project_link: e.target.value })} />
                  </Field>
                </div>
                <Field label="صورة العمل (الغلاف)">
                  <FileUpload accept="image/*" multiple={false} label="ارفع صورة الغلاف"
                    hint="يُفضَّل صورة أفقية بنسبة 16:9 (مثل 1280×720 بكسل) لتظهر البطاقة بشكل مثالي دون اقتطاع"
                    onUploaded={(a) => { setPfCover(a.id); setPf((s) => ({ ...s, cover_url: a.url })); }} />
                  {pfCover && <span className="mt-1 block text-xs text-success">تم رفع الصورة ✓</span>}
                </Field>
                <Field label="وصف العمل" hint={`${pf.description.length.toLocaleString("en-US")}/1000`}>
                  <textarea className="field min-h-24" maxLength={1000} value={pf.description}
                    placeholder="اشرح أهداف المشروع ودورك فيه والنتائج…"
                    onChange={(e) => setPf({ ...pf, description: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="مدة التنفيذ">
                    <div className="flex gap-2">
                      <input type="number" min={0} className="field" value={pf.duration_value}
                        placeholder="المدة" onChange={(e) => setPf({ ...pf, duration_value: e.target.value })} />
                      <select className="field w-28" value={pf.duration_unit} aria-label="وحدة المدة"
                        onChange={(e) => setPf({ ...pf, duration_unit: e.target.value })}>
                        <option value="month">شهر</option>
                        <option value="day">يوم</option>
                      </select>
                    </div>
                  </Field>
                  <Field label="تاريخ الإنجاز">
                    <input type="date" className="field" value={pf.completed_at}
                      onChange={(e) => setPf({ ...pf, completed_at: e.target.value })} />
                  </Field>
                </div>
                <Field label="المهارات المستخدمة" hint="افصل بينها بفاصلة">
                  <input className="field" value={pf.skills} placeholder="Figma، React، Node.js"
                    onChange={(e) => setPf({ ...pf, skills: e.target.value })} />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 accent-primary" checked={pfOwnership}
                    onChange={(e) => setPfOwnership(e.target.checked)} />
                  <span>أؤكد أن هذا العمل نفّذته بنفسي ولديّ الصلاحية الكاملة لنشره.</span>
                </label>
                {pfMsg && <p className="text-xs text-sub">{pfMsg}</p>}
                <button type="button" className="btn-secondary disabled:opacity-50" disabled={pfBusy} onClick={addPortfolio}>
                  {pfBusy ? "جارٍ الإضافة…" : "+ إضافة العمل"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === S_CERTS && (
          <div className="mt-6 space-y-5">
            <p className="text-sm text-sub">أضف شهاداتك ودوراتك التدريبية (اختياري — يمكنك التخطي).</p>
            {certificates.length > 0 && (
              <ul className="space-y-2">
                {certificates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-m border border-line bg-white p-3">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">
                      {c.name}{c.issuer ? <span className="text-sub"> — {c.issuer}</span> : null}
                    </span>
                    <button type="button" className="text-xs font-medium text-danger" onClick={() => removeCertificate(c.id)}>حذف</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-l border border-line bg-white p-4">
              <p className="mb-3 text-sm font-bold text-ink">إضافة شهادة</p>
              <div className="space-y-4">
                <Field label="اسم الشهادة">
                  <input className="field" value={cert.name} placeholder="مثال: شهادة احتراف تصميم UX"
                    onChange={(e) => setCert({ ...cert, name: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="الجهة المانحة">
                    <input className="field" value={cert.issuer} placeholder="مثال: Google / Coursera"
                      onChange={(e) => setCert({ ...cert, issuer: e.target.value })} />
                  </Field>
                  <Field label="نوع الشهادة (اختياري)">
                    <input className="field" value={cert.cert_type} placeholder="مثال: دورة تدريبية"
                      onChange={(e) => setCert({ ...cert, cert_type: e.target.value })} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="سنة الإصدار">
                    <input type="number" className="field" value={cert.issued_year} placeholder="مثال: 2023"
                      onChange={(e) => setCert({ ...cert, issued_year: e.target.value })} />
                  </Field>
                  <Field label="سنة الانتهاء">
                    <input type="number" className="field" value={cert.expiry_year} disabled={cert.no_expiry}
                      placeholder="مثال: 2026" onChange={(e) => setCert({ ...cert, expiry_year: e.target.value })} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary" checked={cert.no_expiry}
                    onChange={(e) => setCert({ ...cert, no_expiry: e.target.checked })} />
                  لا يوجد تاريخ انتهاء
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="رقم الاعتماد (اختياري)">
                    <input className="field" dir="ltr" value={cert.credential_id} placeholder="Credential ID"
                      onChange={(e) => setCert({ ...cert, credential_id: e.target.value })} />
                  </Field>
                  <Field label="رابط التحقق (اختياري)">
                    <input className="field" dir="ltr" value={cert.verification_link} placeholder="https://…"
                      onChange={(e) => setCert({ ...cert, verification_link: e.target.value })} />
                  </Field>
                </div>
                <Field label="المهارات المكتسبة" hint="افصل بينها بفاصلة">
                  <input className="field" value={cert.skills} placeholder="UX، Prototyping"
                    onChange={(e) => setCert({ ...cert, skills: e.target.value })} />
                </Field>
                <Field label="ملف الشهادة (اختياري)">
                  <FileUpload accept="image/*,application/pdf" multiple={false} label="ارفع الملف"
                    onUploaded={(a) => setCertFile(a.id)} />
                  {certFile && <span className="mt-1 block text-xs text-success">تم رفع الملف ✓</span>}
                </Field>
                {certMsg && <p className="text-xs text-sub">{certMsg}</p>}
                <button type="button" className="btn-secondary disabled:opacity-50" disabled={certBusy} onClick={addCertificate}>
                  {certBusy ? "جارٍ الإضافة…" : "+ إضافة الشهادة"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === S_DETAILS && (
          <div className="mt-6 space-y-5">
            <Field label="سعر الساعة (بالدولار الأمريكي)" required error={errors.hourly_rate}>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-12 place-content-center rounded-m bg-tint text-sm font-bold text-primary-dark">USD</span>
                <input type="number" min={0} className="field" value={draft.hourly_rate}
                  placeholder="أدخل سعر الساعة" onChange={(e) => set({ hourly_rate: e.target.value })} />
              </div>
            </Field>
            <Field label="التوفر للعمل" required error={errors.availability}>
              <div className="grid gap-3 sm:grid-cols-3">
                {AVAIL.map(({ v, t, d }) => (
                  <button key={v} type="button"
                    className={`rounded-l border p-3 text-right transition ${draft.availability === v ? "border-primary bg-tint" : "border-line bg-white hover:border-primary/40"}`}
                    onClick={() => set({ availability: v })}>
                    <span className="block text-sm font-bold text-ink">{t}</span>
                    <span className="mt-1 block text-xs text-sub">{d}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="عدد ساعات العمل أسبوعيًا">
              <input type="number" min={0} max={168} className="field" value={draft.weekly_hours}
                placeholder="مثال: 30" onChange={(e) => set({ weekly_hours: e.target.value })} />
            </Field>
            <Field label="ملاحظات للعملاء (اختياري)" hint={`${draft.client_notes.length.toLocaleString("en-US")}/300`}>
              <textarea className="field min-h-20" maxLength={300} value={draft.client_notes}
                placeholder="اكتب أي تفاصيل مهمة تريد أن يعرفها العملاء عن طريقة عملك…"
                onChange={(e) => set({ client_notes: e.target.value })} />
              <ContactHint text={draft.client_notes} mode="review" />
            </Field>
          </div>
        )}

        {step === S_VERIFY && (
          <div className="mt-6 space-y-4">
            {/* email */}
            <div className="flex items-center justify-between rounded-l border border-line bg-white p-4">
              <div>
                <p className="text-sm font-medium text-ink">البريد الإلكتروني</p>
                <p className="text-sm text-sub" dir="ltr">{me.email || "—"}</p>
              </div>
              <span className={`chip ${me.email_verified ? "bg-success-t text-success" : ""}`}>
                {me.email_verified ? "تم التحقق ✓" : "غير مُحقق"}
              </span>
            </div>

            {/* phone OTP — gated by the operator flag (profiles.phone_verification) */}
            {phoneVerifyOn && (
            <div className="rounded-l border border-line bg-white p-4">
              <p className="text-sm font-medium text-ink">رقم الجوال</p>
              {phoneOk ? (
                <span className="chip mt-2 bg-success-t text-success">تم التحقق من رقم الجوال ✓</span>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select className="field w-24" value={cc} onChange={(e) => setCc(e.target.value)} aria-label="رمز الدولة">
                      <option value="+966">+966</option>
                      <option value="+20">+20</option>
                    </select>
                    <input className="field flex-1" inputMode="tel" placeholder="50 123 4567" value={phone}
                      aria-label="رقم الجوال" onChange={(e) => setPhone(digitsOnly(e.target.value))} />
                    <button type="button" className="btn-secondary whitespace-nowrap" disabled={otpBusy || !phone}
                      onClick={requestOtp}>إرسال رمز التحقق</button>
                  </div>
                  {otpSent && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input className="field w-40 text-center tracking-[0.5em]" maxLength={4} inputMode="numeric"
                        placeholder="● ● ● ●" value={code} aria-label="رمز التحقق"
                        onChange={(e) => setCode(digitsOnly(e.target.value))} />
                      <button type="button" className="btn-primary" disabled={otpBusy || code.length < 4}
                        onClick={verifyOtp}>تأكيد</button>
                      <button type="button" className="text-sm font-medium text-primary-dark disabled:opacity-40"
                        disabled={otpBusy} onClick={requestOtp}>إعادة الإرسال</button>
                    </div>
                  )}
                </>
              )}
              {vmsg && <p className="mt-2 text-xs text-sub">{vmsg}</p>}
            </div>
            )}

            {/* national ID — front / back / selfie (slide-08) */}
            <div className="rounded-l border border-line bg-white p-4">
              <p className="text-sm font-medium text-ink">توثيق الهوية</p>
              {idStatus === "approved" ? (
                <span className="chip mt-2 bg-success-t text-success">موثّقة ✓</span>
              ) : idStatus === "pending" ? (
                <span className="chip mt-2 bg-warn-t text-warn">قيد المراجعة ⏳</span>
              ) : (
                <>
                  <label className="mt-2 block text-xs text-sub">نوع المستند</label>
                  <select className="field mt-1" value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="نوع المستند">
                    <option value="national_id">بطاقة هوية وطنية</option>
                    <option value="passport">جواز سفر</option>
                    <option value="driver_license">رخصة قيادة</option>
                  </select>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {([["front", "الوجه الأمامي"], ["back", "الوجه الخلفي"], ["selfie", "صورة شخصية"]] as const).map(([k, label]) => (
                      <div key={k}>
                        <span className="mb-1 block text-xs text-sub">{label}</span>
                        <FileUpload accept="image/*" multiple={false} label="رفع"
                          onUploaded={(a) => setIdFiles((f) => ({ ...f, [k]: a.id }))} />
                        {idFiles[k] && <span className="mt-1 block text-[11px] text-success">تم الرفع ✓</span>}
                      </div>
                    ))}
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs text-sub">
                    <input type="checkbox" className="mt-0.5 accent-primary" checked={idConsent}
                      onChange={(e) => setIdConsent(e.target.checked)} />
                    <span>أوافق على معالجة بيانات هويتي لأغراض التحقق وفق سياسة الخصوصية.</span>
                  </label>
                  <button type="button" className="btn-secondary mt-3 disabled:opacity-50" disabled={idBusy} onClick={submitIdVerification}>
                    {idBusy ? "جارٍ الإرسال…" : "إرسال للمراجعة"}
                  </button>
                </>
              )}
              {idMsg && <p className="mt-2 text-xs text-sub">{idMsg}</p>}
            </div>

            <p className="text-xs text-sub">
              التحقق اختياري الآن — يمكنك إكمال توثيق الهوية لاحقًا من إعدادات حسابك. التحقق يزيد ثقة العملاء بك.
            </p>
          </div>
        )}

        {step === S_REVIEW && (
          <div className="mt-6 space-y-4">
            <div className="rounded-l border border-success/30 bg-success-t p-4 text-sm font-medium text-success">
              ملفك جاهز بنسبة {pct.toLocaleString("en-US")}٪ — راجعه ثم أرسله لمراجعة الإدارة قبل النشر
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard title="البيانات الشخصية" onEdit={() => setStep(S_PERSONAL)}>
                {draft.display_name || "—"} · {draft.overview ? "نبذة مضافة" : "بدون نبذة"}
              </SummaryCard>
              <SummaryCard title="العمل والمهارات" onEdit={() => setStep(S_WORK)}>
                {draft.bio_title || "—"} · {skills.length.toLocaleString("en-US")} مهارة
              </SummaryCard>
              <SummaryCard title="معرض الأعمال" onEdit={() => setStep(S_PORTFOLIO)}>
                {portfolio.length.toLocaleString("en-US")} عمل
              </SummaryCard>
              <SummaryCard title="الشهادات والتدريب" onEdit={() => setStep(S_CERTS)}>
                {certificates.length.toLocaleString("en-US")} شهادة
              </SummaryCard>
              <SummaryCard title="تفاصيل العمل" onEdit={() => setStep(S_DETAILS)}>
                <span>{draft.hourly_rate ? formatUSD(draft.hourly_rate) : "—"}</span> /س · {AVAIL.find((a) => a.v === draft.availability)?.t}
              </SummaryCard>
              <SummaryCard title="التحقق" onEdit={() => setStep(S_VERIFY)}>
                {me.email_verified ? "البريد ✓ " : ""}{phoneOk ? "الجوال ✓" : "الجوال غير مُحقق"}
              </SummaryCard>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)} />
              أؤكد صحة البيانات المدخلة وجاهزية الملف للنشر
            </label>
          </div>
        )}

        {formError && <p className="mt-5 rounded-m bg-danger-t p-3 text-sm text-danger">{formError}</p>}
      </section>

      <footer
        className={`sticky bottom-0 border-t border-line bg-white/95 backdrop-blur ${keyboardOpen ? "hidden" : ""}`}
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="w-full sm:w-64">
            <WizardStepper steps={STEPS} current={step} percent={pct} />
            {step !== S_REVIEW && (
              <button type="button" onClick={saveAndExit} disabled={busy}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline disabled:opacity-40">
                حفظ واستكمال لاحقاً
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary disabled:opacity-40"
              disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(s - 1, 0))}>
              السابق
            </button>
            {step === S_REVIEW && (
              <a href="/me/profile" target="_blank" rel="noreferrer" className="btn-secondary">معاينة</a>
            )}
            {/* تخطي only on optional steps (slide-08/10) */}
            {STEPS[step]?.optional && (
              <button type="button" className="btn-secondary disabled:opacity-40" disabled={busy}
                onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}>
                تخطي
              </button>
            )}
            <button type="button" className="btn-primary disabled:opacity-50"
              disabled={busy || (step === S_REVIEW && !confirm)} onClick={goNext}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-l border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">{title}</p>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-primary-dark hover:underline">
          تعديل
        </button>
      </div>
      <p className="mt-1.5 text-sm text-sub">{children}</p>
    </div>
  );
}
