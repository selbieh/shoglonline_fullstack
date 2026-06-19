"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { tokens } from "@/lib/api";
import { getMessages } from "@/lib/i18n";

/**
 * Landing CTA action. Server-rendered as the "Continue with Google" sign-in
 * prompt, but once the visitor is authenticated (token in localStorage, same
 * check as SiteHeader) the Google sign-in disappears and we point them to
 * their dashboard instead — a signed-in user has nothing to sign in to.
 */
export default function CtaButton({ label, link }: { label?: string; link?: string }) {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!tokens.access);
  }, []);

  const t = getMessages();

  if (authed) {
    return (
      <Link href="/dashboard" className="btn mt-8 bg-white text-lg text-primary-dark shadow-glow hover:bg-tint">
        {t.nav.dashboard}
      </Link>
    );
  }

  return (
    <>
      {label && (
        <Link href={link || "/signin"} className="btn mt-8 bg-white text-lg text-primary-dark shadow-glow hover:bg-tint">
          <span className="font-extrabold text-[#4285F4]">G</span> {label}
        </Link>
      )}
      <p className="mt-4 text-xs text-tint/80">بلا كلمات مرور · بلا رسوم تسجيل · يمكنك التصفّح أولًا</p>
    </>
  );
}
