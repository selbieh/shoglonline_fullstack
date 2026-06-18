"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";

/** Hero search box — routes to the jobs listing pre-filled with the query. */
export default function HeroSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/jobs?search=${encodeURIComponent(term)}` : "/jobs");
  }

  return (
    <form onSubmit={go} className="mt-7 flex max-w-lg items-center gap-1.5 rounded-full bg-white p-1.5 shadow-glow">
      <span className="ps-3 text-[20px] text-sub" aria-hidden><SearchIcon /></span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث عن وظيفة أو مهارة…"
        aria-label="ابحث عن وظيفة أو مهارة"
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-ink placeholder:text-sub focus:outline-none"
      />
      <button type="submit" className="btn-primary shrink-0 rounded-full px-6 py-2 text-sm">
        بحث
      </button>
    </form>
  );
}
