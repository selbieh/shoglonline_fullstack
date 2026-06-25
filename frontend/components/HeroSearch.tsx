"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";

const MIN_CHARS = 3; // don't fire a search for 1–2 characters

/** Hero search box — routes to the gallery pre-filled with the query. */
export default function HeroSearch() {
  const [q, setQ] = useState("");
  const [hint, setHint] = useState(false);
  const router = useRouter();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < MIN_CHARS) {
      setHint(true); // block: needs at least MIN_CHARS characters
      return;
    }
    router.push(`/gallery?search=${encodeURIComponent(term)}`);
  }

  return (
    <div className="mt-7 max-w-lg">
      <form onSubmit={go} className="flex items-center gap-1.5 rounded-full bg-white p-1.5 shadow-glow">
        <span className="ps-3 text-[20px] text-sub" aria-hidden><SearchIcon /></span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (hint && e.target.value.trim().length >= MIN_CHARS) setHint(false);
          }}
          placeholder="صمم شعار…"
          aria-label="ابحث في معرض الأعمال"
          aria-invalid={hint}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-ink placeholder:text-sub focus:outline-none"
        />
        <button type="submit" className="btn-primary shrink-0 rounded-full px-6 py-2 text-sm">
          ابدأ
        </button>
      </form>
      {hint && (
        <p className="mt-2 ps-4 text-sm text-tint" role="alert">
          اكتب 3 أحرف على الأقل للبحث
        </p>
      )}
    </div>
  );
}
