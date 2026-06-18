"use client";

import { useEffect, useState } from "react";
import { api, tokens } from "@/lib/api";
import { BellIcon } from "@/components/icons";

type Sub = { id: number; category: number; category_name: string; subcategory: number | null };

/**
 * Inline "subscribe to this category" toggle for the jobs listing (FR-SUB-1).
 * Reuses the replace-all PUT /me/category-subscriptions contract used by the
 * dedicated /subscriptions page: we hold the full current set and PUT the merged set.
 * Top-level (no subcategory) subscriptions only — matching the /subscriptions UI.
 */
export default function SubscribeCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: number;
  categoryName: string;
}) {
  const [authed, setAuthed] = useState(false);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const isAuthed = Boolean(tokens.access);
    setAuthed(isAuthed);
    if (!isAuthed) return;
    api<Sub[]>("/me/category-subscriptions")
      .then(setSubs)
      .catch(() => setSubs([])); // a load failure shouldn't hide the action
  }, []);

  const subscribed = subs?.some((s) => s.category === categoryId && s.subcategory === null) ?? false;

  async function toggle() {
    if (subs === null) return;
    const next = subscribed
      ? subs.filter((s) => !(s.category === categoryId && s.subcategory === null))
      : [...subs, { id: 0, category: categoryId, category_name: categoryName, subcategory: null }];
    setSubs(next); // optimistic
    setBusy(true);
    setMsg(null);
    try {
      await api("/me/category-subscriptions", {
        method: "PUT",
        body: JSON.stringify(next.map((s) => ({ category: s.category, subcategory: s.subcategory }))),
      });
      setMsg(subscribed ? "أُلغي الاشتراك" : "✅ تم الاشتراك — ستصلك إشعارات الوظائف الجديدة");
    } catch {
      setSubs(subs); // revert
      setMsg("تعذّر الحفظ — حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div className="flex items-start gap-2.5 rounded-m bg-tint p-4 text-sm text-primary-dark">
        <BellIcon className="mt-0.5 shrink-0 text-[18px] text-primary" />
        <span>
          <a href="/signin" className="font-bold underline">سجّل الدخول</a> لتشترك في «{categoryName}» ويصلك بريد فور نشر وظيفة جديدة.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-m bg-tint p-4 text-sm text-primary-dark">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || subs === null}
        aria-pressed={subscribed}
        className={`flex w-full items-center justify-center gap-2 rounded-m px-4 py-2.5 font-bold transition disabled:opacity-60 ${
          subscribed ? "bg-white text-primary-dark hover:bg-line/40" : "bg-primary text-white hover:bg-primary-dark"
        }`}
      >
        <BellIcon className="text-[17px]" />
        {subscribed ? `مشترك في «${categoryName}» — إلغاء` : `اشترك في «${categoryName}»`}
      </button>
      <p className="mt-2 text-center text-xs">
        {msg ?? "اشترك ليصلك بريد فور نشر وظيفة جديدة في هذه الفئة."}{" "}
        <a href="/subscriptions" className="underline">إدارة كل الاشتراكات</a>
      </p>
    </div>
  );
}
