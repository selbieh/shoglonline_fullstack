"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ModeToggle from "@/components/ModeToggle";
import NotificationsBell from "@/components/NotificationsBell";
import { api, tokens, type Me } from "@/lib/api";
import { bidsEnabled, fetchPublicSettings } from "@/lib/settings";
import {
  BellIcon, BriefcaseIcon, ChatIcon, ClipboardIcon, DocumentIcon, EnvelopeIcon, GearIcon,
  GiftIcon, PlusIcon, ShieldIcon, SparklesIcon, TicketIcon, UsersIcon, WalletIcon,
} from "@/components/icons";

type IconCmp = (props: { className?: string }) => JSX.Element;
type Wallet = { available: string; escrow_held: string; earnings_pending: string };
type Kpi = { label: string; value: string; href: string; Icon: IconCmp; tone: string };
type QuickLink = { href: string; label: string; desc: string; Icon: IconCmp; tone: string };

/** Dashboard shell — renders the lens of the active mode (FR-MODE-2/3) with REAL stats. */
export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const [bidsOn, setBidsOn] = useState(true);

  async function loadKpis(mode: Me["active_mode"]) {
    const worker = mode === "find_job";
    try {
      const wallet = await api<Wallet>("/me/wallet");
      if (worker) {
        const flagsOn = bidsEnabled(await fetchPublicSettings());
        setBidsOn(flagsOn);
        const contracts = await api<{ count: number }>("/me/contracts?role=worker");
        // only fetch the bid balance / show the bid KPI while the bid economy is on
        const bidKpi: Kpi[] = flagsOn
          ? [{ label: "رصيد العروض", value: String((await api<{ balance: number }>("/me/bids")).balance), href: "/bids", Icon: TicketIcon, tone: "bg-amber-100 text-amber-700" }]
          : [];
        setKpis([
          ...bidKpi,
          { label: "عقودي كمستقل", value: String(contracts.count), href: "/contracts", Icon: DocumentIcon, tone: "bg-indigo-100 text-indigo-700" },
          { label: "أرباح معلّقة", value: `${wallet.earnings_pending}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-sky-100 text-sky-700" },
          { label: "الرصيد المتاح", value: `${wallet.available}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-emerald-100 text-emerald-700" },
        ]);
      } else {
        const [jobs, contracts] = await Promise.all([
          api<{ count: number }>("/me/jobs"),
          api<{ count: number }>("/me/contracts?role=employer"),
        ]);
        setKpis([
          { label: "وظائفي", value: String(jobs.count), href: "/me/jobs", Icon: BriefcaseIcon, tone: "bg-sky-100 text-sky-700" },
          { label: "عقودي كصاحب عمل", value: String(contracts.count), href: "/contracts", Icon: DocumentIcon, tone: "bg-indigo-100 text-indigo-700" },
          { label: "محجوز في الضمان", value: `${wallet.escrow_held}$`, href: "/wallet", Icon: ShieldIcon, tone: "bg-violet-100 text-violet-700" },
          { label: "الرصيد المتاح", value: `${wallet.available}$`, href: "/wallet", Icon: WalletIcon, tone: "bg-emerald-100 text-emerald-700" },
        ]);
      }
    } catch {
      setKpis([]); // a transient KPI failure shouldn't blank the whole dashboard
    }
  }

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
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
      .catch(() => router.replace("/signin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  const worker = me.active_mode === "find_job";

  // Mode-specific tools — the toggle swaps the whole group so each lens only shows
  // the actions that make sense for it (a worker doesn't post jobs; an employer has no proposals).
  const modeLinks: QuickLink[] = worker
    ? [
        { href: "/jobs", label: "تصفّح الوظائف", desc: "ابحث وقدّم عروضك", Icon: BriefcaseIcon, tone: "bg-sky-100 text-sky-700" },
        { href: "/me/proposals", label: "عروضي المقدّمة", desc: "تابع حالة كل عرض", Icon: ClipboardIcon, tone: "bg-purple-100 text-purple-700" },
        { href: "/me/services", label: "خدماتي", desc: "أضِف، عدّل، فعّل خدماتك", Icon: SparklesIcon, tone: "bg-violet-100 text-violet-700" },
        { href: "/contracts", label: "عقودي كمستقل", desc: "الأعمال الجارية والمكتملة", Icon: DocumentIcon, tone: "bg-indigo-100 text-indigo-700" },
        ...(bidsOn ? [{ href: "/bids", label: "رصيد العروض", desc: "اشحن رصيد التقديم", Icon: TicketIcon, tone: "bg-amber-100 text-amber-700" }] : []),
        { href: "/subscriptions", label: "اشتراكات الفئات", desc: "تنبيهات الوظائف الجديدة", Icon: EnvelopeIcon, tone: "bg-sky-100 text-sky-700" },
      ]
    : [
        { href: "/jobs/new", label: "نشر وظيفة", desc: "انشر متطلباتك مجانًا", Icon: PlusIcon, tone: "bg-emerald-100 text-emerald-700" },
        { href: "/me/jobs", label: "إدارة وظائفي", desc: "الوظائف والعروض المستلمة", Icon: ClipboardIcon, tone: "bg-indigo-100 text-indigo-700" },
        { href: "/freelancers", label: "تصفّح المستقلين", desc: "وظّف الأنسب مباشرةً", Icon: UsersIcon, tone: "bg-sky-100 text-sky-700" },
        { href: "/services", label: "الخدمات الجاهزة", desc: "اطلب خدمة فورية", Icon: SparklesIcon, tone: "bg-violet-100 text-violet-700" },
        { href: "/contracts", label: "عقودي كصاحب عمل", desc: "تابِع تنفيذ أعمالك", Icon: DocumentIcon, tone: "bg-indigo-100 text-indigo-700" },
      ];

  // Account tools — identical in both modes (one account, one wallet).
  const accountLinks: QuickLink[] = [
    { href: "/messages", label: "الرسائل", desc: "محادثاتك مع الطرف الآخر", Icon: ChatIcon, tone: "bg-teal-100 text-teal-700" },
    { href: "/wallet", label: "محفظتي", desc: "الرصيد والمعاملات", Icon: WalletIcon, tone: "bg-emerald-100 text-emerald-700" },
    { href: "/notifications", label: "الإشعارات", desc: "آخر التحديثات", Icon: BellIcon, tone: "bg-rose-100 text-rose-700" },
    { href: "/settings", label: "الإعدادات", desc: "حسابك وخصوصيتك", Icon: GearIcon, tone: "bg-slate-100 text-slate-600" },
    { href: "/affiliate", label: "الإحالة", desc: "اربح بدعوة أصدقائك", Icon: GiftIcon, tone: "bg-fuchsia-100 text-fuchsia-700" },
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
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="الصفحة الرئيسية" className="text-xl font-extrabold text-primary transition hover:text-primary-dark">
            شغل أونلاين
          </Link>
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <a
              href="/messages"
              className="grid h-9 w-9 place-content-center rounded-full text-[20px] text-teal-600 transition hover:bg-teal-50"
              aria-label="الرسائل"
              title="الرسائل"
            >
              <ChatIcon />
            </a>
            <ModeToggle
              mode={me.active_mode}
              onChange={(m) => { setMe({ ...me, active_mode: m }); setKpis(null); loadKpis(m); }}
            />
            <button
              className="text-sm text-sub hover:text-danger"
              onClick={async () => {
                await api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh: tokens.refresh }) }).catch(() => undefined);
                tokens.clear();
                router.push("/");
              }}
            >
              خروج
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-extrabold">
          {worker ? "صباح الخير" : "مرحبًا"}، {me.first_name || me.email} 👋
        </h1>
        <p className="mt-1 text-sm text-sub">
          {worker ? "إليك ملخص نشاطك كباحث عن عمل" : "ملخص نشاطك كصاحب عمل — نفس الحساب، نفس المحفظة"}
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

        <h2 className="mt-10 text-lg font-bold">حسابي</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {accountLinks.map(renderLink)}
        </div>
      </section>
    </main>
  );
}
