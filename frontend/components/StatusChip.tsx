import type { ReactNode } from "react";

/* Color-coded status/verification badge (centralizes the STATUS_TONE pattern). Pass the tone
   classes (e.g. "bg-success-t text-success") + the label. Server-renderable. */

export default function StatusChip({ tone = "bg-tint text-primary-dark", children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{children}</span>;
}
