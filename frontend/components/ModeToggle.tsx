"use client";

import { api } from "@/lib/api";

/**
 * The view toggle (SRS §3.1, FR-MODE-2): pure presentation lens.
 * Switching is instant, lossless, and never gates any capability.
 */
export default function ModeToggle({
  mode,
  onChange,
}: {
  mode: "find_job" | "find_worker" | "";
  onChange: (m: "find_job" | "find_worker") => void;
}) {
  async function setMode(m: "find_job" | "find_worker") {
    if (m === mode) return;
    onChange(m); // optimistic — FR-MODE-2: instant re-render
    try {
      await api("/auth/me/mode", { method: "PATCH", body: JSON.stringify({ mode: m }) });
    } catch {
      onChange(mode === "find_worker" ? "find_worker" : "find_job"); // revert on failure
    }
  }

  const seg = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition ${
      active ? "bg-primary text-white" : "text-sub"
    }`;

  return (
    <div
      className="inline-flex rounded-full bg-tint p-1"
      title="حساب واحد — التبديل لا يفقد أي بيانات"
    >
      <button className={seg(mode === "find_worker")} onClick={() => setMode("find_worker")}>
        أوظِّف الآن
      </button>
      <button className={seg(mode === "find_job")} onClick={() => setMode("find_job")}>
        أبحث عن عمل
      </button>
    </div>
  );
}
