"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { isAuthError } from "@/lib/errors";
import type { FreelancerDetail } from "@/lib/types";
import type { ServiceCardData } from "@/components/ServiceCard";
import FreelancerProfileView from "@/components/FreelancerProfileView";
import PageLoader from "@/components/PageLoader";
import { ArrowLeftIcon, EyeIcon } from "@/components/icons";

/* Owner-only preview of the public profile (slide-12) — renders the SAME <FreelancerProfileView>
   the employer sees on /freelancers/[id], but from the owner's own data via the authed
   /me/profile/preview endpoint, so a draft / pending-review profile can be checked before it goes
   live. Intentionally NOT wrapped in DashboardShell: the whole point is to see the public layout. */

export default function ProfilePreviewPage() {
  const router = useRouter();
  const [f, setF] = useState<FreelancerDetail | null>(null);
  const [services, setServices] = useState<ServiceCardData[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    (async () => {
      let detail: FreelancerDetail;
      try {
        detail = await api<FreelancerDetail>("/me/profile/preview");
      } catch (e) {
        if (isAuthError(e)) router.replace(signinHereHref());
        else setError(true);
        return;
      }
      setF(detail);
      // Services published by this worker — same query the public page runs. A failure here just
      // shows the profile without the services section rather than blanking the whole preview.
      try {
        const resp = await api<{ results: ServiceCardData[] }>(`/services?worker=${detail.id}`);
        setServices(resp?.results ?? []);
      } catch {
        setServices([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-bold text-ink">تعذّر تحميل المعاينة</p>
        <a href="/me/profile" className="btn-secondary mt-4 inline-flex">العودة لتحرير الملف</a>
      </main>
    );
  }
  if (!f) return <PageLoader />;

  return (
    <FreelancerProfileView
      f={f}
      services={services}
      headerSlot={
        <div className="-mx-4 mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-warn/30 bg-warn-t px-4 py-3 sm:-mx-6 sm:px-6">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-warn">
            <EyeIcon className="text-[18px]" /> معاينة — هكذا يظهر ملفك للعملاء
          </p>
          <a href="/me/profile" className="btn-secondary inline-flex items-center gap-1 text-sm">
            <ArrowLeftIcon className="text-[15px]" /> العودة للتحرير
          </a>
        </div>
      }
      actions={
        // The real hire CTA, shown disabled so the owner sees exactly what employers get without
        // being able to act on it.
        <div className="mt-4">
          <button type="button" disabled aria-disabled className="btn-primary w-full cursor-not-allowed opacity-60"
            title="هذا الزر يظهر للعملاء فقط">
            توظيف المستقل
          </button>
        </div>
      }
    />
  );
}
