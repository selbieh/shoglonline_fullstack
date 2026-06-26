"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import { apiError } from "@/lib/errors";
import { digitsOnly } from "@/lib/arabic";

type Job ={ id: number; title: string; slug: string; status: string; budget_min: string; budget_max: string; proposals_count: number };
type Contract = { id: number; status: string; my_role: string; counterpart: { id: number; name: string } };

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", pending_review: "بانتظار المراجعة", published: "منشورة", in_progress: "قيد التنفيذ",
  completed: "مكتملة", closed: "مغلقة", rejected: "مرفوضة", archived: "مؤرشفة", suspended: "موقوفة",
};

export default function MyJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [pastWorkers, setPastWorkers] = useState<{ id: number; name: string }[]>([]);
  const [repostId, setRepostId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", budget_min: "", budget_max: "", visibility: "public", worker_id: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    const [j, c] = await Promise.all([
      api<{ results: Job[] }>("/me/jobs"),
      api<{ results: Contract[] }>("/me/contracts?role=employer"),
    ]);
    setJobs(j.results);
    const workers = new Map<number, string>();
    c.results.filter((x) => x.status === "completed").forEach((x) => workers.set(x.counterpart.id, x.counterpart.name));
    setPastWorkers([...workers].map(([id, name]) => ({ id, name })));
  }, []);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    // api() already bounces a real 401 to sign-in; only 5xx/network errors reach here.
    load().catch(() => setErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    setErr(false);
    setJobs(null);
    load().catch(() => setErr(true));
  }

  function openRepost(job: Job) {
    setRepostId(job.id);
    setForm({ title: job.title, budget_min: job.budget_min, budget_max: job.budget_max, visibility: "public", worker_id: "" });
    setMsg(null);
  }

  async function submitRepost(jobId: number) {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        title: form.title, budget_min: form.budget_min, budget_max: form.budget_max, visibility: form.visibility,
      };
      if (form.visibility === "specific" && form.worker_id) body.worker_id = Number(form.worker_id);
      await api(`/me/jobs/${jobId}/repost`, { method: "POST", body: JSON.stringify(body) });
      setMsg({ ok: true, text: "✅ أُعيد نشر الوظيفة" });
      setRepostId(null);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusy(false);
    }
  }

  async function rehire(worker: { id: number; name: string }) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/me/rehire", { method: "POST", body: JSON.stringify({ worker_id: worker.id }) });
      setMsg({ ok: true, text: `✅ أُنشئت وظيفة خاصة ودُعي ${worker.name} للتقديم` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: apiError(e).message_ar });
    } finally {
      setBusy(false);
    }
  }

  if (err) return (
    <main className="grid min-h-screen place-content-center gap-3 text-center text-sub">
      <p>تعذّر تحميل وظائفك.</p>
      <button type="button" onClick={retry} className="font-bold text-primary-dark underline">إعادة المحاولة</button>
    </main>
  );
  if (!jobs) return <main className="grid min-h-screen place-content-center text-sub">جارٍ التحميل…</main>;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">وظائفي</h1>
        <div className="flex gap-3">
          <a href="/jobs/new" className="btn-primary">+ نشر وظيفة</a>
          <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
        </div>
      </div>

      {msg && <p className={`mt-4 rounded-m p-3 text-sm ${msg.ok ? "bg-success-t text-success" : "bg-warn-t text-warn"}`} role="status">{msg.text}</p>}

      <ul className="mt-6 space-y-3">
        {jobs.length === 0 && <li className="card text-center text-sub">لم تنشر وظائف بعد</li>}
        {jobs.map((job) => (
          <li key={job.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{job.title}</p>
                <p className="mt-0.5 text-xs text-sub">
                  {STATUS_LABEL[job.status] ?? job.status} · {job.proposals_count} عرض · <span dir="ltr">{job.budget_min}–{job.budget_max}$</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/me/jobs/${job.id}/proposals`} className="btn-secondary text-sm">
                  العروض{job.proposals_count > 0 ? ` (${job.proposals_count})` : ""}
                </a>
                <a href={`/jobs/${job.slug}`} className="text-sm text-primary-dark">عرض</a>
                <button className="btn-secondary text-sm" onClick={() => openRepost(job)}>إعادة نشر</button>
              </div>
            </div>

            {repostId === job.id && (
              <div className="mt-4 space-y-3 rounded-m bg-bg p-4">
                <input className="w-full field" aria-label="العنوان"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <div className="flex gap-2">
                  <input className="w-32 field" inputMode="numeric" aria-label="أدنى ميزانية"
                    value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: digitsOnly(e.target.value) })} />
                  <input className="w-32 field" inputMode="numeric" aria-label="أعلى ميزانية"
                    value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: digitsOnly(e.target.value) })} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`vis-${job.id}`} checked={form.visibility === "public"}
                      onChange={() => setForm({ ...form, visibility: "public" })} /> عامة
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`vis-${job.id}`} checked={form.visibility === "specific"}
                      onChange={() => setForm({ ...form, visibility: "specific" })} /> لمستقل محدّد
                  </label>
                  {form.visibility === "specific" && (
                    <input className="w-32 field" placeholder="معرّف المستقل"
                      aria-label="معرّف المستقل" value={form.worker_id} onChange={(e) => setForm({ ...form, worker_id: e.target.value })} />
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => submitRepost(job.id)}>إعادة النشر</button>
                  <button className="btn-secondary" onClick={() => setRepostId(null)}>إلغاء</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {pastWorkers.length > 0 && (
        <section className="card mt-8">
          <h2 className="font-bold">إعادة توظيف مستقل سابق</h2>
          <p className="mt-1 text-xs text-sub">ننشئ وظيفة خاصة مُعبّأة مسبقًا وندعو المستقل للتقديم دون خصم عرض.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pastWorkers.map((w) => (
              <li key={w.id}>
                <button className="rounded-full bg-tint px-4 py-2 text-sm hover:bg-primary hover:text-white"
                  disabled={busy} onClick={() => rehire(w)}>
                  إعادة توظيف {w.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
