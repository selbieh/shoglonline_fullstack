import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { JsonLd, SITE_URL, serverApi } from "@/lib/seo";

const HOME_DESC =
  "ابحث عن أفضل المستقلين العرب أو انشر وظيفتك مجانًا — آلاف الخدمات الجاهزة، عروض من محترفين، ومدفوعات محمية بنظام الضمان. حساب واحد للعمل والتوظيف، ودخول بنقرة عبر جوجل.";

export const metadata: Metadata = {
  title: "شغل أونلاين — وظّف مستقلين واعثر على عمل حر",
  description: HOME_DESC,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "شغل أونلاين — وظّف مستقلين واعثر على عمل حر",
    description: HOME_DESC,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: "شغل أونلاين", description: HOME_DESC },
};
import { Blobs, HeroIllustration, RatingChip, Wave } from "@/components/Brand";
import CategoryGrid from "@/components/CategoryGrid";
import CtaButton from "@/components/CtaButton";
import HeroSearch from "@/components/HeroSearch";
import { FeatureIcon } from "@/components/FeatureIcon";
import { BoltIcon, BriefcaseIcon, CheckIcon, ShieldIcon, SparklesIcon, UsersIcon } from "@/components/icons";

/* Landing page — server-rendered (SEO) from the CMS (GET /landing) and the live
   catalog (GET /categories); falls back to built-in defaults so it always renders. */

type Cat = { id: number; slug: string; name_ar: string; icon: string };
type Card = { icon: string; title: string; subtitle: string; link: string; image_url: string };
type Section = {
  key: string;
  kind: "hero" | "cards" | "categories" | "steps" | "cta";
  heading: string;
  subheading: string;
  cta_primary_label: string;
  cta_primary_link: string;
  cta_secondary_label: string;
  cta_secondary_link: string;
  cards: Card[];
};

const DEFAULTS: Section[] = [
  {
    key: "hero", kind: "hero",
    heading: "وظّف أفضل المستقلين أو ابدأ عملك التالي — بثقة",
    subheading: "حساب واحد للوضعين، مدفوعات محمية بالضمان، ودخول عبر جوجل بنقرة. تصفّح الآن بدون تسجيل.",
    cta_primary_label: "تصفّح الوظائف", cta_primary_link: "/jobs",
    cta_secondary_label: "تصفّح الخدمات", cta_secondary_link: "/services", cards: [],
  },
  {
    key: "features", kind: "cards", heading: "", subheading: "",
    cta_primary_label: "", cta_primary_link: "", cta_secondary_label: "", cta_secondary_link: "",
    cards: [
      { icon: "🛡", title: "مدفوعات بالضمان", subtitle: "المبلغ محجوز حتى تسلّم وتُقبل الأعمال.", link: "", image_url: "" },
      { icon: "🔁", title: "حساب واحد، وضعان", subtitle: "بدّل بين «أبحث عن عمل» و«أوظّف» فورًا.", link: "", image_url: "" },
      { icon: "🔒", title: "دخول عبر جوجل", subtitle: "تسجيل آمن بنقرة واحدة بلا كلمات مرور.", link: "", image_url: "" },
      { icon: "⚡", title: "سريع وآني", subtitle: "إشعارات ومحادثات لحظية بين الطرفين.", link: "", image_url: "" },
    ],
  },
  {
    key: "categories", kind: "categories", heading: "تصفّح حسب الفئة", subheading: "",
    cta_primary_label: "", cta_primary_link: "", cta_secondary_label: "", cta_secondary_link: "",
    cards: [
      ["💻", "برمجة وتقنية"], ["🎨", "تصميم وإبداع"], ["✍️", "كتابة وترجمة"], ["📣", "تسويق رقمي"],
      ["📊", "أعمال ومالية"], ["🎙️", "صوتيات"], ["☎️", "مبيعات ودعم"], ["🧭", "استشارات"],
    ].map(([icon, title]) => ({ icon, title, subtitle: "", link: "/jobs", image_url: "" })),
  },
  {
    key: "steps", kind: "steps", heading: "كيف تعمل المنصة؟", subheading: "",
    cta_primary_label: "", cta_primary_link: "", cta_secondary_label: "", cta_secondary_link: "",
    cards: [
      { icon: "١", title: "تصفّح بحرية", subtitle: "استعرض الوظائف والخدمات وابحث وفلتر دون تسجيل.", link: "", image_url: "" },
      { icon: "٢", title: "سجّل بنقرة", subtitle: "دخول عبر جوجل عند التقديم أو الشراء — بلا كلمات مرور.", link: "", image_url: "" },
      { icon: "٣", title: "اعمل بأمان", subtitle: "مدفوعات بنظام الضمان: تُحجز وتُحرَّر بعد التسليم والقبول.", link: "", image_url: "" },
    ],
  },
  {
    key: "cta", kind: "cta",
    heading: "جاهز للبدء؟ حساب واحد للوضعين", subheading: "سجّل بنقرة عبر جوجل — وادفع أو اعمل بأمان الضمان",
    cta_primary_label: "المتابعة باستخدام جوجل", cta_primary_link: "/signin",
    cta_secondary_label: "", cta_secondary_link: "", cards: [],
  },
];


/* CMS labels historically carried a leading emoji (e.g. "💼 تصفّح الوظائف"); strip it
   so we can render a crisp inline line-icon instead. Safe no-op for emoji-free labels. */
const stripLeadingEmoji = (s: string) => s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");

/** Hero CTA — modern inline icon (jobs → briefcase, services → sparkles) + label. */
function HeroCta({ label, link, fallback, variant }: { label: string; link: string; fallback: string; variant: "primary" | "secondary" }) {
  const href = link || fallback;
  const Icon = href.includes("/services")
    ? SparklesIcon
    : href.includes("/freelancers")
      ? UsersIcon
      : BriefcaseIcon;
  const cls =
    variant === "primary"
      ? "btn bg-white text-primary-dark shadow-glow hover:bg-tint"
      : "btn border border-white/70 text-white hover:bg-white/10";
  return (
    <Link href={href} className={cls}>
      <Icon className="text-[18px]" /> {stripLeadingEmoji(label)}
    </Link>
  );
}

function Hero({ s }: { s: Section }) {
  return (
    <section className="relative overflow-hidden bg-hero bg-spotlight text-white">
      <Blobs />
      <div className="dots pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-28 pt-20 lg:grid-cols-2">
        <div>
          <span className="glass animate-fade-up inline-flex items-center gap-2 px-4 py-1 text-sm">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_2px_rgba(27,138,90,0.45)]" />
            منصة عربية واحدة · للتوظيف والعمل الحر
          </span>
          <h1 className="animate-fade-up delay-100 mt-5 text-4xl font-extrabold leading-snug drop-shadow-sm md:text-5xl">{s.heading}</h1>
          <p className="animate-fade-up delay-200 mt-4 max-w-lg text-lg text-tint">{s.subheading}</p>
          <div className="animate-fade-up delay-300">
            <HeroSearch />
          </div>
          <div className="animate-fade-up delay-400 mt-6 flex flex-wrap gap-3">
            <HeroCta label="تصفّح المستقلين" link="/freelancers" fallback="/freelancers" variant="primary" />
            <HeroCta label="تصفّح الخدمات" link="/services" fallback="/services" variant="secondary" />
            <HeroCta label="تصفّح الوظائف" link="/jobs" fallback="/jobs" variant="secondary" />
          </div>
          <div className="animate-fade-up delay-400 mt-8 flex flex-wrap gap-3 text-sm">
            {[
              { Icon: CheckIcon, t: "بدون كلمات مرور" },
              { Icon: ShieldIcon, t: "ضمان للطرفين" },
              { Icon: BoltIcon, t: "آني" },
            ].map(({ Icon, t }) => (
              <span key={t} className="glass inline-flex items-center gap-1.5 px-3 py-1"><Icon className="text-[14px]" /> {t}</span>
            ))}
          </div>
        </div>
        <div className="relative flex justify-center lg:justify-end">
          <div className="animate-float">
            <HeroIllustration className="w-full max-w-md drop-shadow-2xl" />
          </div>
          {/* floating rating chips from the brand set (export/Frame*) — orbit the
              illustration like the PDF hero */}
          <RatingChip n={1} className="animate-float-slow absolute left-0 top-6 w-40 sm:w-44" />
          <RatingChip n={2} className="animate-float-delayed absolute -bottom-2 right-0 w-40 sm:w-44" />
          <span className="float-badge animate-float bottom-24 left-2 hidden sm:flex">
            <span className="grid h-5 w-5 place-content-center rounded-full bg-success text-[12px] text-white"><CheckIcon /></span>
            تم تحرير الضمان
          </span>
        </div>
      </div>
      <Wave />
    </section>
  );
}

/* on-brand icon-tile tones — periwinkle / lavender / light-blue family (matches the PDF) */
const FEATURE_TONES = [
  "bg-tint text-primary-dark",
  "bg-accent-sky text-primary-deep",
  "bg-primary/10 text-primary-dark",
  "bg-tint text-primary",
];

function StatsBand() {
  const stats = [
    { n: "100%", t: "حماية بالضمان", icon: "🛡", color: "text-success" },
    { n: "0", t: "كلمات مرور", icon: "🔑", color: "text-primary" },
    { n: "1", t: "حساب للوضعين", icon: "🔁", color: "text-primary-dark" },
    { n: "24/7", t: "محادثات وإشعارات", icon: "💬", color: "text-primary" },
  ];
  return (
    <section className="relative z-10 mx-auto mt-6 max-w-5xl px-6">
      <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-l border border-line bg-line/70 shadow-glow sm:grid-cols-4">
        {/* gradient hairline along the very top of the band */}
        <span className="bg-hero absolute inset-x-0 top-0 z-10 h-1" aria-hidden />
        {stats.map((st, i) => (
          <div
            key={i}
            className="group relative bg-white/95 px-5 py-7 text-center backdrop-blur transition duration-300 hover:bg-tint/50"
          >
            <div className={`mb-2 flex justify-center transition duration-300 group-hover:-translate-y-0.5 ${st.color}`}>
              <FeatureIcon icon={st.icon} className="text-2xl" />
            </div>
            <div className="gradient-text text-3xl font-extrabold leading-none transition duration-300 group-hover:scale-110 sm:text-4xl">
              {st.n}
            </div>
            <div className="mt-2 text-xs font-medium text-sub">{st.t}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cards({ s }: { s: Section }) {
  const heading = s.heading || "كل ما تحتاجه في منصّة واحدة";
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div className="mb-12 text-center">
        <span className="chip"><SparklesIcon className="text-[14px]" /> لماذا شغل أونلاين</span>
        <h2 className="mt-4 text-3xl font-extrabold gradient-text">{heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sub">
          مزايا مصمّمة لتحميك وتُسرّع عملك — من أول نقرة حتى تحرير الضمان.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {s.cards.map((c, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-l border border-line bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-glow"
          >
            {/* faint ghost icon watermark for depth */}
            <span
              className="pointer-events-none absolute -bottom-6 -left-4 select-none text-[7rem] text-primary opacity-[0.07] transition duration-500 group-hover:scale-110 group-hover:opacity-[0.12]"
              aria-hidden
            >
              <FeatureIcon icon={c.icon} />
            </span>
            {/* corner glow on hover */}
            <span
              className="bg-hero pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition duration-500 group-hover:opacity-25"
              aria-hidden
            />
            <div className="relative">
              <div
                className={`grid h-14 w-14 place-content-center rounded-2xl text-[26px] transition duration-300 group-hover:scale-105 ${FEATURE_TONES[i % FEATURE_TONES.length]}`}
              >
                <FeatureIcon icon={c.icon} />
              </div>
              <h3 className="mt-5 text-lg font-bold transition group-hover:text-primary-dark">{c.title}</h3>
              {c.subtitle && <p className="mt-1.5 text-sm leading-relaxed text-sub">{c.subtitle}</p>}
            </div>
            {/* bottom accent that sweeps in on hover (RTL: anchored to the right) */}
            <span
              className="bg-hero absolute bottom-0 right-0 h-1 w-0 transition-all duration-300 group-hover:w-full"
              aria-hidden
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Categories({ s, cats }: { s: Section; cats: Cat[] }) {
  // CategoryGrid renders the live catalog (slug links) with SSR + client self-heal;
  // falls back to the section's CMS cards only if no catalog is reachable at all.
  const fallback = s.cards.map((c) => ({ icon: c.icon, title: c.title, link: c.link || "/jobs" }));
  return (
    <section id="categories" className="bg-mesh scroll-mt-24 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-extrabold">{s.heading}</h2>
          <Link href="/jobs" className="text-sm font-medium text-primary-dark hover:text-primary-deep">كل الفئات ←</Link>
        </div>
        <CategoryGrid initial={cats} fallback={fallback} />
      </div>
    </section>
  );
}

function Steps({ s }: { s: Section }) {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
      <h2 className="text-center text-2xl font-extrabold gradient-text">{s.heading}</h2>
      <div className="relative mt-12 grid gap-8 md:grid-cols-3">
        {/* gradient connector that links the numbered steps (desktop) */}
        <div
          className="absolute inset-x-[16%] top-7 hidden h-0.5 bg-gradient-to-l from-primary/10 via-primary/50 to-primary/10 md:block"
          aria-hidden
        />
        {s.cards.map((c, i) => (
          <div key={i} className="relative flex flex-col items-center text-center">
            <div className="bg-hero relative z-10 grid h-14 w-14 place-content-center rounded-full text-xl font-extrabold text-white shadow-glow ring-8 ring-bg">{c.icon}</div>
            <div className="card card-hover mt-5 w-full">
              <h3 className="font-bold">{c.title}</h3>
              {c.subtitle && <p className="mt-1 text-sm text-sub">{c.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  const items = [
    {
      name: "نورة العتيبي", role: "مصمّمة جرافيك", avatar: "ن", stars: 5,
      quote: "أنجزت أكثر من ٣٠ مشروعًا خلال أشهر، ونظام الضمان جعلني أعمل وأنا مطمئنة على حقّي بالكامل.",
    },
    {
      name: "أحمد منصور", role: "صاحب متجر إلكتروني", avatar: "أ", stars: 5,
      quote: "وظّفت مستقلين محترفين بسرعة، والدفع لا يُحرَّر إلا بعد أن أستلم العمل وأرضى عنه — تجربة مريحة.",
    },
    {
      name: "ليلى حسن", role: "مطوّرة ويب", avatar: "ل", stars: 5,
      quote: "الدخول بنقرة عبر جوجل والمحادثات الآنية وفّرا عليّ وقتًا كبيرًا. منصّة عربية بمعايير عالمية.",
    },
  ];
  return (
    <section className="bg-mesh py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-extrabold gradient-text">ماذا يقول مستخدمونا</h2>
        <p className="mt-2 text-center text-sub">تجارب من أصحاب أعمال ومستقلين على المنصّة</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((t, i) => (
            <figure key={i} className="card card-hover relative overflow-hidden">
              <span className="pointer-events-none absolute -left-1 top-0 text-7xl leading-none text-tint" aria-hidden>”</span>
              <div className="relative text-warn" aria-label={`${t.stars} من 5`}>{"★".repeat(t.stars)}</div>
              <blockquote className="relative mt-3 text-sm leading-relaxed text-ink">{t.quote}</blockquote>
              <figcaption className="relative mt-5 flex items-center gap-3 border-t border-line pt-4">
                <span className="bg-hero grid h-10 w-10 shrink-0 place-content-center rounded-full font-bold text-white shadow-glow">{t.avatar}</span>
                <span>
                  <span className="block font-bold leading-tight">{t.name}</span>
                  <span className="block text-xs text-sub">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta({ s }: { s: Section }) {
  return (
    <section className="relative overflow-hidden bg-hero bg-spotlight text-white">
      <Blobs />
      <div className="dots pointer-events-none absolute inset-0 opacity-[0.10]" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="glass mx-auto max-w-2xl px-8 py-12 shadow-glow">
          <h2 className="text-3xl font-extrabold drop-shadow-sm">{s.heading}</h2>
          {s.subheading && <p className="mt-3 text-tint">{s.subheading}</p>}
          <CtaButton label={s.cta_primary_label} link={s.cta_primary_link} />
        </div>
      </div>
    </section>
  );
}

export default async function Landing() {
  // Server-rendered for SEO: fetch CMS sections + live categories at request time.
  const [landing, catsData] = await Promise.all([
    serverApi<{ sections: Section[] }>("/landing"),
    serverApi<Cat[]>("/categories"),
  ]);
  const sections = landing?.sections?.length ? landing.sections : DEFAULTS;
  const cats = catsData ?? [];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "شغل أونلاين",
      url: SITE_URL,
      description: "منصة عربية للوظائف والخدمات الحرة بمدفوعات آمنة بنظام الضمان",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "شغل أونلاين",
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/jobs?search={query}`,
        "query-input": "required name=query",
      },
    },
  ];

  return (
    <>
      <main className="overflow-hidden">
        <JsonLd data={jsonLd} />
        {sections.map((s) => {
          if (s.kind === "hero")
            return (
              <Fragment key={s.key}>
                <Hero s={s} />
                <StatsBand />
              </Fragment>
            );
          if (s.kind === "cards") return <Cards key={s.key} s={s} />;
          if (s.kind === "categories") return <Categories key={s.key} s={s} cats={cats} />;
          if (s.kind === "steps") return <Steps key={s.key} s={s} />;
          if (s.kind === "cta")
            return (
              <Fragment key={s.key}>
                <Testimonials />
                <Cta s={s} />
              </Fragment>
            );
          return null;
        })}
      </main>
    </>
  );
}
