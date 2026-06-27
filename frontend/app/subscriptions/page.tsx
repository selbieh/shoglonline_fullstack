"use client";

import PageLoader from "@/components/PageLoader";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { signinHereHref } from "@/lib/nav";
import type { Category } from "@/lib/types";

type Sub = { id: number; category: number; category_name: string; subcategory: number | null };

export default function SubscriptionsPage() {
  const router = useRouter();
  const [cats, setCats] = useState<Category[] | null>(null);
  const [subscribed, setSubscribed] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace(signinHereHref());
      return;
    }
    Promise.all([api<Category[]>("/categories"), api<Sub[]>("/me/category-subscriptions")])
      .then(([c, subs]) => {
        setCats(c);
        setSubscribed(new Set(subs.filter((s) => s.subcategory === null).map((s) => s.category)));
      })
      .catch(() => router.replace(signinHereHref()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(categoryId: number) {
    const next = new Set(subscribed);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setSubscribed(next);
    setBusy(true);
    setMsg(null);
    try {
      await api("/me/category-subscriptions", {
        method: "PUT",
        body: JSON.stringify([...next].map((id) => ({ category: id, subcategory: null }))),
      });
      setMsg("✅ حُفظت اشتراكاتك");
    } catch {
      setSubscribed(subscribed); // revert
      setMsg("تعذّر الحفظ — حاول مجددًا");
    } finally {
      setBusy(false);
    }
  }

  if (!cats) return <PageLoader />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">اشتراكات الفئات</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>
      <p className="mt-1 text-sm text-sub">
        اشترك في فئة لتصلك إشعارات بالوظائف الجديدة فيها. يمكنك إلغاء الاشتراك في أي وقت.
      </p>

      {msg && <p className="mt-4 rounded-m bg-success-t p-3 text-sm text-success" role="status">{msg}</p>}

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {cats.map((cat) => (
          <li key={cat.id}>
            <label className="flex cursor-pointer items-center justify-between rounded-m border border-line bg-white p-4 transition hover:border-primary">
              <span className="font-medium">{cat.icon} {cat.name_ar}</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                aria-label={cat.name_ar}
                checked={subscribed.has(cat.id)}
                disabled={busy}
                onChange={() => toggle(cat.id)}
              />
            </label>
          </li>
        ))}
        {cats.length === 0 && <li className="text-sm text-sub">لا توجد فئات بعد.</li>}
      </ul>
    </main>
  );
}
