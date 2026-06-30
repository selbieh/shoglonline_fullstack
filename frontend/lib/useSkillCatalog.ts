"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SkillOption } from "@/components/SkillPicker";

/** Loads the public skills catalog (GET /skills) once, for any catalog-backed picker or filter.
 *  Returns [] until it resolves; a failed/empty fetch degrades to [] (the picker simply shows no
 *  options) rather than throwing — these are all best-effort enhancements over the bare list. */
export function useSkillCatalog(): SkillOption[] {
  const [catalog, setCatalog] = useState<SkillOption[]>([]);
  useEffect(() => {
    let alive = true;
    api<SkillOption[] | { results: SkillOption[] }>("/skills")
      .then((s) => {
        if (alive) setCatalog(Array.isArray(s) ? s : s?.results ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}
