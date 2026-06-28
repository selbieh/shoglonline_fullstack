"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import type { Job } from "@/lib/types";
import PageLoader from "@/components/PageLoader";
import JobDetailBody from "./JobDetailBody";

/* Fallback when the SSR (unauthenticated) fetch returns nothing — which happens for an
   invite-only job (FR-JOB-12): the backend 404s a private job to anyone who isn't the owner or an
   invited worker, and SSR has no access to the localStorage token. Here we retry the fetch WITH the
   viewer's token so the owner / invited worker can open the job they were notified about. Anything
   that still can't load (genuinely missing, or not invited) shows a friendly not-available screen. */
export default function PrivateJobView({ slug }: { slug: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null | undefined>(undefined);

  useEffect(() => {
    if (!tokens.access) {
      setJob(null);
      return;
    }
    api<Job>(`/jobs/${encodeURIComponent(slug)}`)
      .then(setJob)
      .catch(() => setJob(null));
  }, [slug]);

  if (job === undefined) return <PageLoader />;

  if (!job) {
    const authed = Boolean(tokens.access);
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">هذه الوظيفة غير متاحة لك</h1>
        <p className="mt-3 text-sub">
          {authed
            ? "قد تكون وظيفة خاصة بدعوة، أو لم تَعُد متاحة. تأكد أنك سجّلت الدخول بالحساب المدعوّ."
            : "قد تكون وظيفة خاصة بدعوة — سجّل الدخول بالحساب الذي تلقّى الدعوة لعرضها."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!authed && (
            <button onClick={() => router.push(signinHereHref())} className="btn-primary">تسجيل الدخول</button>
          )}
          <a href="/jobs" className="btn-secondary">تصفّح الوظائف</a>
        </div>
      </main>
    );
  }

  return <JobDetailBody job={job} />;
}
