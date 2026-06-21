"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, tokens } from "@/lib/api";

/* Profile action buttons. Renders the SELF view (تعديل/إعدادات — ppt slide-11) when the
   signed-in user is viewing their own profile, otherwise the OTHERS view (توظيف — slide-12).
   Per rule D-2 there is NO direct-message entry here: chat only opens once the two parties
   share an active contract (reached via hiring). Client-side so the public profile page can
   stay server-rendered for SEO. */

export default function ProfileActions({ profileId }: { profileId: number }) {
  const [meId, setMeId] = useState<number | null>(null);

  useEffect(() => {
    if (!tokens.access) return;
    api<{ id: number }>("/auth/me").then((u) => setMeId(u.id)).catch(() => {});
  }, []);

  if (meId === profileId) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/me/profile" className="btn-primary flex-1">تعديل الملف</Link>
        <Link href="/settings" className="btn-secondary">الإعدادات</Link>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href="/jobs/new" className="btn-primary w-full">توظيف المستقل</Link>
    </div>
  );
}
