"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, tokens } from "@/lib/api";
import { LockIcon } from "@/components/icons";

type Conversation = {
  id: number;
  context_type: string;
  read_only: boolean;
  other: { id: number; name: string; email: string };
  unread: number;
  last_message_snippet: string;
  last_message_at: string | null;
};

const CTX_LABEL: Record<string, string> = {
  contract: "عقد",
  proposal: "عرض",
  service: "خدمة",
  direct: "مباشرة",
};

export default function MessagesPage() {
  const router = useRouter();
  const [convs, setConvs] = useState<Conversation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ results: Conversation[] }>("/me/conversations");
      setConvs(res.results);
    } catch {
      router.replace("/signin");
    }
  }, [router]);

  useEffect(() => {
    if (!tokens.access) {
      router.replace("/signin");
      return;
    }
    load();
  }, [load, router]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">الرسائل</h1>
        <a href="/dashboard" className="text-sm text-primary-dark">← لوحتي</a>
      </div>

      {convs === null ? (
        <p className="mt-10 text-center text-sub">جارٍ التحميل…</p>
      ) : convs.length === 0 ? (
        <div className="mt-10 rounded-m bg-tint p-8 text-center text-sub">
          لا محادثات بعد — تبدأ المحادثة عند قبول عرض أو تفعيل عقد.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {convs.map((c) => (
            <li key={c.id}>
              <a href={`/messages/${c.id}`} className="card flex items-center justify-between gap-3 hover:shadow-md">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold">
                    {c.other.name}
                    <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-sub">{CTX_LABEL[c.context_type]}</span>
                    {c.read_only && <span className="inline-flex items-center gap-1 text-xs text-sub"><LockIcon className="text-[12px]" /> للقراءة فقط</span>}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-sub">{c.last_message_snippet || "—"}</p>
                </div>
                {c.unread > 0 && (
                  <span className="grid h-6 min-w-6 place-content-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
