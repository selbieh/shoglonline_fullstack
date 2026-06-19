"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModeToggle from "@/components/ModeToggle";
import DashboardShell from "@/components/DashboardShell";
import { api, tokens, type Me } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import { STATUS_CHIP, STATUS_LABEL } from "@/lib/contractStatus";
import {
  BellIcon, BriefcaseIcon, ChatIcon, ClipboardIcon, DocumentIcon, EnvelopeIcon, GearIcon,
  GiftIcon, HeartIcon, PlusIcon, ShieldIcon, SparklesIcon, TicketIcon, UsersIcon, WalletIcon,
} from "@/components/icons";

type IconCmp = (props: { className?: string }) => JSX.Element;
type Wallet = { available: string; escrow_held: string; earnings_pending: string };
type Kpi = { label: string; value: string; href: string; Icon: IconCmp; tone: string };
type QuickLink = { href: string; label: string; desc: string; Icon: IconCmp; tone: string };
type Job = {
  id: number; title: string; slug: string; status: string;
  budget_min?: string; budget_max?: string; proposals_count?: number; published_at?: string;
};
type Task = {
  id: number; title: string; budget: string; status: string;
  counterpart?: { name: string }; deadline?: string | null;
};

const JOB_STATUS: Record<string, string> = {
  draft: "مسودة", pending_review: "بانتظار المراجعة", published: "منشورة", in_progress: "قيد التنفيذ",
  completed: "مكتملة", closed: "مغلقة", rejected: "مرفوضة", archived: "مؤرشفة", suspended: "موقوفة",
};

/** Dashboard shell — renders the lens of the active mode (FR-MODE-2/3) with REAL stats. */
export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bidsOn, setBidsOn] = useState(true);

  async function loadKpis(mode: Me["active_mode"]) {
    const worker = mode === "find_job";
    try {
      const wallet = await api<Wallet>("/me/wallet");
      if (worker) {
        const flagsOn = bidsEnabled(await fetchPublicSettings());
        setBidsOn(flagsOn);
        const contracts = await api<{ count: number; results?: Task[] }>("/me/contracts?role=worker");
        setTasks(contracts.results ?? []);
        // only fetch the bid balance / show the bid KPI while the bid economy is on
        const bidKpi: Kpi[] = flagsOn
          ? [{ label: "رصيد العروض", value: String((await api<{ balance: number }>("/me/bids")).balance), href: "/bids", Icon: TicketIcon, tone: "bg-tint text-primary-dark" }]
          : [];
        setKpis([
          ...bidKpi,
          { label: "عقودي كمستقل", value: String(contracts.count), href: "/contracts", Icon: DocumentIcon, tone: "bg-tint text-primary-dark" },
          { label: "أرباح معلّقة", value: `${wallet.earnings_pending}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-warn-t text-warn" },
          { label: "الرصيد المتاح", value: `${wallet.available}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-success-t text-success" },
        ]);
      } else {
        const [myJobs, contracts] = await Promise.all([
          api<{ count: number; results?: Job[] }>("/me/jobs"),
          api<{ count: number }>("/me/contracts?role=employer"),
        ]);
        setJobs(myJobs.results ?? []);
        setKpis([
          { label: "وظائفي", value: String(myJobs.count), href: "/me/jobs", Icon: BriefcaseIcon, tone: "bg-tint text-primary-dark" },
          { label: "عقودي كصاحب عمل", value: String(contracts.count), href: "/contracts", Icon: DocumentIcon, tone: "bg-tint text-primary-dark" },
          { label: "محجوز في الضمان", value: `${wallet.escrow_held}$`, href: "/wallet", Icon: ShieldIcon, tone: "bg-accent-sky text-primary-deep" },
          { label: "الرصيد المتاح", value: `${wallet.available}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-success-t text-success" },
        ]);
      }
    } catch {
      setKpis([]); // a transient KPI failure shouldn't blank the whole dashboard
    }
  }

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    api<Me>("/auth/me")
      .then(async (data) => {
        if (!data.active_mode) {
          router.replace("/onboarding/mode");
          return;
        }
        setMe(data);
        await loadKpis(data.active_mode);
      })
      .catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  const worker = me.active_mode === "find_job";

  // employer verification meter (ppt slide-28) — channels readable without extra calls
  const vChannels = [
    { label: "البريد الإلكتروني", ok: !!me.email_verified },
    { label: "رقم الجوال", ok: !!me.phone_verified },
  ];
  const vPct = Math.round((vChannels.filter((c) => c.ok).length / vChannels.length) * 100);

  // Mode-specific tools — the toggle swaps the whole group so each lens only shows
  // the actions that make sense for it (a worker doesn't post jobs; an employer has no proposals).
  const modeLinks: QuickLink[] = worker
    ? [
        { href: "/jobs", label: "تصفّح الوظائف", desc: "ابحث وقدّم عروضك", Icon: BriefcaseIcon, tone: "bg-tint text-primary-dark" },
        { href: "/me/proposals", label: "عروضي المقدّمة", desc: "تابع حالة كل عرض", Icon: ClipboardIcon, tone: "bg-tint text-primary-dark" },
        { href: "/me/services", label: "خدماتي", desc: "أضِف، عدّل، فعّل خدماتك", Icon: SparklesIcon, tone: "bg-accent-sky text-primary-deep" },
        { href: "/contracts", label: "عقودي كمستقل", desc: "الأعمال الجارية والمكتملة", Icon: DocumentIcon, tone: "bg-tint text-primary-dark" },
        ...(bidsOn ? [{ href: "/bids", label: "رصيد العروض", desc: "اشحن رصيد التقديم", Icon: TicketIcon, tone: "bg-tint text-primary-dark" }] : []),
        { href: "/subscriptions", label: "اشتراكات الفئات", desc: "تنبيهات الوظائف الجديدة", Icon: EnvelopeIcon, tone: "bg-tint text-primary-dark" },
      ]
    : [
        { href: "/jobs/new", label: "نشر وظيفة", desc: "انشر متطلباتك مجانًا", Icon: PlusIcon, tone: "bg-success-t text-success" },
        { href: "/me/jobs", label: "إدارة وظائفي", desc: "الوظائف والعروض المستلمة", Icon: ClipboardIcon, tone: "bg-tint text-primary-dark" },
        { href: "/freelancers", label: "تصفّح المستقلين", desc: "وظّف الأنسب مباشرةً", Icon: UsersIcon, tone: "bg-tint text-primary-dark" },
        { href: "/services", label: "الخدمات الجاهزة", desc: "اطلب خدمة فورية", Icon: SparklesIcon, tone: "bg-accent-sky text-primary-deep" },
        { href: "/contracts", label: "عقودي كصاحب عمل", desc: "تابِع تنفيذ أعمالك", Icon: DocumentIcon, tone: "bg-tint text-primary-dark" },
      ];

  // Account tools — identical in both modes (one account, one wallet).
  const accountLinks: QuickLink[] = [
    { href: "/me/favorites", label: "المفضلة", desc: "الخدمات التي حفظتها", Icon: HeartIcon, tone: "bg-danger-t text-danger" },
    { href: "/messages", label: "الرسائل", desc: "محادثاتك مع الطرف الآخر", Icon: ChatIcon, tone: "bg-tint text-primary-dark" },
    { href: "/wallet", label: "محفظتي", desc: "الرصيد والمعاملات", Icon: WalletIcon, tone: "bg-success-t text-success" },
    { href: "/notifications", label: "الإشعارات", desc: "آخر التحديثات", Icon: BellIcon, tone: "bg-accent-sky text-primary-deep" },
    { href: "/settings", label: "الإعدادات", desc: "حسابك وخصوصيتك", Icon: GearIcon, tone: "bg-tint text-sub" },
    { href: "/affiliate", label: "الإحالة", desc: "اربح بدعوة أصدقائك", Icon: GiftIcon, tone: "bg-accent-sky text-primary-deep" },
  ];

  const renderLink = ({ href, label, desc, Icon, tone }: QuickLink) => (
    <a key={href} href={href} className="card-modern group flex items-center gap-3 p-4">
      <span className={`icon-tile h-10 w-10 shrink-0 text-[18px] transition duration-300 group-hover:scale-105 ${tone}`}>
        <Icon />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink transition group-hover:text-primary-dark">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-sub">{desc}</span>
      </span>
    </a>
  );

  return (
    <DashboardShell
      active="home"
      title={`${worker ? "صباح الخير" : "مرحبًا"}، ${me.first_name || me.email}`}
      subtitle={worker ? "إليك ملخص نشاطك كباحث عن عمل" : "ملخص نشاطك كصاحب عمل — نفس الحساب، نفس المحفظة"}
      headerActions={
        <ModeToggle
          mode={me.active_mode}
          onChange={(m) => { setMe({ ...me, active_mode: m }); setKpis(null); loadKpis(m); }}
        />
      }
    >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {kpis === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-modern animate-pulse flex items-center gap-4 p-5" aria-hidden>
                  <div className="h-12 w-12 shrink-0 rounded-m bg-line" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-line" />
                    <div className="h-6 w-1/3 rounded bg-line" />
                  </div>
                </div>
              ))
            : kpis.map((k) => (
                <a key={k.label} href={k.href} className="card-modern group flex items-center gap-4 p-5">
                  <span className={`icon-tile h-12 w-12 shrink-0 text-[20px] transition duration-300 group-hover:scale-105 ${k.tone}`}>
                    <k.Icon />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-sub">{k.label}</span>
                    <span className="mt-0.5 block text-2xl font-extrabold" dir="ltr">{k.value}</span>
                  </span>
                </a>
              ))}
        </div>

        <div className="mt-10 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{worker ? "أدوات المستقل" : "أدوات صاحب العمل"}</h2>
          <span className="text-xs text-sub">{worker ? "ابحث وقدّم وأدِر أعمالك" : "وظّف وأدِر مشاريعك"}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {modeLinks.map(renderLink)}
        </div>

        {worker && (
          /* freelancer recent tasks (ppt slide-14/15) */
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">آخر مهامي</h2>
              <a href="/contracts" className="text-sm font-medium text-primary-dark hover:underline">عرض كل المهام ←</a>
            </div>
            <div className="card mt-4">
              {tasks.length === 0 ? (
                <div className="py-10 text-center text-sub">
                  لا مهام بعد — <a href="/jobs" className="text-primary-dark hover:underline">تصفّح الوظائف وقدّم عروضك</a>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="text-xs text-sub">
                      <tr className="border-b border-line">
                        <th className="pb-2 font-medium">المهمة</th>
                        <th className="pb-2 font-medium">صاحب العمل</th>
                        <th className="pb-2 font-medium">القيمة</th>
                        <th className="pb-2 font-medium">الحالة</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.slice(0, 6).map((t) => (
                        <tr key={t.id} className="border-b border-line/60 last:border-0">
                          <td className="py-2.5 font-medium">
                            <a href={`/contracts/${t.id}`} className="hover:text-primary-dark">{t.title}</a>
                          </td>
                          <td className="py-2.5 text-sub">{t.counterpart?.name ?? "—"}</td>
                          <td className="py-2.5 text-sub" dir="ltr">${t.budget}</td>
                          <td className="py-2.5">
                            <span className={`chip ${STATUS_CHIP[t.status] ?? "bg-tint text-primary-dark"}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                          </td>
                          <td className="py-2.5">
                            <a href={`/contracts/${t.id}`} className="text-xs text-primary-dark hover:underline">عرض</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {!worker && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">المهام المفتوحة</h2>
              <a href="/jobs/new" className="btn-primary text-sm">+ إضافة مهمة جديدة</a>
            </div>
            <div className="mt-4 grid gap-5 lg:grid-cols-3">
              {/* verification status (right rail) */}
              <div className="card">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">حالة التحقق</h3>
                  <a href="/settings" className="text-xs text-primary-dark hover:underline">إدارة التحقق</a>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-tint">
                  <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${vPct}%` }} />
                </div>
                <p className="mt-1 text-xs text-sub">مستوى التحقق {vPct.toLocaleString("ar-EG")}٪</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {vChannels.map((c) => (
                    <li key={c.label} className="flex items-center justify-between">
                      <span className="text-sub">{c.label}</span>
                      <span className={`chip ${c.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`}>
                        {c.ok ? "موثّق" : "غير مكتمل"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* open-tasks table */}
              <div className="card lg:col-span-2">
                {jobs.length === 0 ? (
                  <div className="py-10 text-center text-sub">
                    لا مهام بعد — <a href="/jobs/new" className="text-primary-dark hover:underline">انشر أول مشروع</a>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-xs text-sub">
                        <tr className="border-b border-line">
                          <th className="pb-2 font-medium">عنوان المهمة</th>
                          <th className="pb-2 font-medium">الميزانية</th>
                          <th className="pb-2 font-medium">العروض</th>
                          <th className="pb-2 font-medium">الحالة</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.slice(0, 6).map((j) => (
                          <tr key={j.id} className="border-b border-line/60 last:border-0">
                            <td className="py-2.5 font-medium">
                              <a href={`/jobs/${j.slug}`} className="hover:text-primary-dark">{j.title}</a>
                            </td>
                            <td className="py-2.5 text-sub" dir="ltr">
                              {j.budget_min ?? "—"}{j.budget_max ? `–${j.budget_max}` : ""}
                            </td>
                            <td className="py-2.5 text-sub">{(j.proposals_count ?? 0).toLocaleString("ar-EG")}</td>
                            <td className="py-2.5">
                              <span className="chip bg-tint text-primary-dark">{JOB_STATUS[j.status] ?? j.status}</span>
                            </td>
                            <td className="py-2.5">
                              <a href="/me/jobs" className="text-xs text-primary-dark hover:underline">عرض</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <h2 className="mt-10 text-lg font-bold">حسابي</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accountLinks.map(renderLink)}
        </div>
    </DashboardShell>
  );
}
