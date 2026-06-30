"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { isAuthError } from "@/lib/errors";
import ServiceDetailView, { type ServiceDetail } from "@/components/ServiceDetailView";
import PageLoader from "@/components/PageLoader";
import { ArrowLeftIcon, EyeIcon } from "@/components/icons";
import { formatUSD } from "@/lib/currency";

/* Owner-only preview of a service as the buyer sees it (slide-21) — renders the SAME
   <ServiceDetailView> the buyer gets on /services/[slug], but from the owner's own authed
   /me/services/<id> data, so a draft / pending-review / paused service can be checked before it
   goes live. The public detail page is LIVE-only (404s otherwise, and would inflate the owner's own
   view count), so the owner's "معاينة" links here instead. */

/** A non-interactive copy of the buyer's order card — same layout, every control disabled. */
function PreviewBuyBox({ s }: { s: ServiceDetail }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">اطلب هذه الخدمة</h2>

      {s.addons.length > 0 && (
        <div>
          <p className="text-sm text-sub">إضافات اختيارية</p>
          <ul className="mt-2 space-y-1">
            {s.addons.map((a) => (
              <li key={a.id}>
                <label className="flex items-center justify-between rounded-m bg-bg px-3 py-2 text-sm opacity-70">
                  <span><input type="checkbox" disabled className="me-2" /> {a.title}</span>
                  <span>{formatUSD(a.price, { signed: true })}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-sub">يبدأ من</span>
        <span className="text-2xl font-extrabold text-primary">{formatUSD(s.base_price, { decimals: 2 })}</span>
      </div>
      <button type="button" disabled aria-disabled className="btn-primary w-full cursor-not-allowed opacity-60"
        title="هذا الزر يظهر للمشترين فقط">
        إرسال طلب الشراء
      </button>
      <p className="text-xs text-sub">
        يُحجز المبلغ في الضمان عند قبول المستقل ويُحرَّر بعد تسليمك وقبولك للعمل.
      </p>
    </section>
  );
}

export default function ServicePreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [s, setS] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    (async () => {
      try {
        setS(await api<ServiceDetail>(`/me/services/${params.id}`));
      } catch (e) {
        if (isAuthError(e)) router.replace(signinHereHref());
        else setError(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-bold text-ink">تعذّر تحميل المعاينة</p>
        <a href={`/me/services/${params.id}`} className="btn-secondary mt-4 inline-flex">العودة لإدارة الخدمة</a>
      </main>
    );
  }
  if (!s) return <PageLoader />;

  return (
    <ServiceDetailView
      s={s}
      headerSlot={
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warn/30 bg-warn-t px-6 py-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-warn">
            <EyeIcon className="text-[18px]" /> معاينة — هكذا تظهر خدمتك للمشترين
          </p>
          <a href={`/me/services/${params.id}`} className="btn-secondary inline-flex items-center gap-1 text-sm">
            <ArrowLeftIcon className="text-[15px]" /> العودة للإدارة
          </a>
        </div>
      }
      buyBox={<PreviewBuyBox s={s} />}
    />
  );
}
