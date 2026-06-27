"use client";

import PageLoader from "@/components/PageLoader";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { formatUSD } from "@/lib/currency";

type Summary = { slug: string; is_frozen: boolean; total_earned: string; accrued: string; referrals: number };
type Referrals = {
  referrals: { email: string; since: string; window_end: string }[];
  commissions: { contract: number; amount: string; status: string; at: string }[];
};

export default function AffiliatePage() {
  const router = useRouter();
  const [s, setS] = useState<Summary | null>(null);
  const [data, setData] = useState<Referrals | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sum, det] = await Promise.all([
        api<Summary>("/me/affiliate"),
        api<Referrals>("/me/affiliate/referrals"),
      ]);
      setS(sum);
      setData(det);
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

  if (!s) return <PageLoader />;

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${s.slug}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">برنامج الإحالة</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>
      <p className="mt-1 text-sm text-sub">ادعُ آخرين واكسب نسبة من عمولة المنصة على معاملاتهم.</p>

      <section className="card mt-5">
        <p className="text-sm text-sub">رابط الإحالة الخاص بك</p>
        <div className="mt-2 flex gap-2">
          <input className="flex-1 field" dir="ltr" readOnly value={link} />
          <button
            className="btn-secondary"
            onClick={() => {
              // only flip to "✓ نُسخ" if the copy actually succeeded (clipboard can be blocked / absent)
              navigator.clipboard?.writeText(link)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => {});
            }}
          >
            {copied ? "✓ نُسخ" : "نسخ"}
          </button>
        </div>
        {s.is_frozen && <p className="mt-2 text-xs text-danger">⚠️ مشاركتك في البرنامج موقوفة حاليًا</p>}
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-sub">إجمالي الأرباح</p>
          <p className="mt-1 text-2xl font-extrabold text-success">{formatUSD(s.total_earned, { decimals: 2 })}</p>
        </div>
        <div className="card">
          <p className="text-sm text-sub">أرباح محتسبة</p>
          <p className="mt-1 text-2xl font-extrabold">{formatUSD(s.accrued, { decimals: 2 })}</p>
        </div>
        <div className="card">
          <p className="text-sm text-sub">عدد المُحالين</p>
          <p className="mt-1 text-2xl font-extrabold">{s.referrals}</p>
        </div>
      </div>

      {data && data.commissions.length > 0 && (
        <section className="card mt-5">
          <h2 className="font-bold">سجل العمولات</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {data.commissions.map((c, i) => (
              <li key={i} className="flex items-center justify-between rounded-s bg-bg px-3 py-1.5">
                <span>عقد #{c.contract}</span>
                <span className="flex items-center gap-2">
                  <span className="font-bold">{formatUSD(c.amount, { decimals: 2 })}</span>
                  <span className={`text-xs ${c.status === "clawed_back" ? "text-danger" : "text-success"}`}>
                    {c.status === "clawed_back" ? "مُسترجعة" : "محتسبة"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
