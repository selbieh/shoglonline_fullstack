"use client";

import { useState, type MouseEvent } from "react";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton, { type ReportKind } from "@/components/ReportButton";
import { ShareIcon } from "@/components/icons";

type FavKind = "service" | "job" | "freelancer" | "portfolio";

/* The shared "card actions" trio shown on every public listing card: report (flag to admin →
   /reports review queue), favourite (heart → /me/favorites) and share (native share sheet with a
   clipboard fallback). `variant="overlay"` wraps each button in a white pill so the cluster reads
   on top of cover media (services / gallery); `variant="inline"` is the bare hover-tint button for
   text cards (jobs / freelancers). All three stop propagation so the cluster can sit inside a card
   link. Pass `favoriteKind` to include the heart (omit where favouriting doesn't apply). */
export default function CardActions({
  shareUrl,
  shareTitle,
  reportKind,
  favoriteKind,
  id,
  favoriteInitial,
  variant = "inline",
  className,
}: {
  shareUrl: string;
  shareTitle?: string;
  reportKind: ReportKind;
  favoriteKind?: FavKind;
  id: number;
  favoriteInitial?: boolean;
  variant?: "inline" | "overlay";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function share(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof window !== "undefined" ? `${window.location.origin}${shareUrl}` : shareUrl;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ url, title: shareTitle }).catch(() => {});
    } else {
      // No native share (desktop): copy to clipboard and confirm so the click isn't silent.
      navigator?.clipboard?.writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
        .catch(() => {});
    }
  }

  const base = "grid h-9 w-9 place-content-center rounded-full text-[18px] transition disabled:opacity-50";
  const skin = variant === "overlay" ? "bg-white/90 shadow-sm ring-1 ring-line backdrop-blur" : "";

  return (
    <div className={`flex shrink-0 items-center gap-1 ${className ?? ""}`}>
      <ReportButton kind={reportKind} id={id} className={`${base} ${skin} text-sub hover:bg-danger-t hover:text-danger`} />
      {favoriteKind && (
        <FavoriteButton
          kind={favoriteKind}
          id={id}
          initial={favoriteInitial}
          className={`${base} ${skin} text-danger hover:bg-danger-t`}
        />
      )}
      <span className="relative">
        <button
          type="button"
          onClick={share}
          title="مشاركة"
          aria-label="مشاركة"
          className={`${base} ${skin} text-sub hover:bg-tint hover:text-primary`}
        >
          <ShareIcon />
        </button>
        {copied && (
          <span role="status" className="absolute -top-7 start-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-0.5 text-[11px] text-white shadow">
            تم نسخ الرابط
          </span>
        )}
      </span>
    </div>
  );
}
