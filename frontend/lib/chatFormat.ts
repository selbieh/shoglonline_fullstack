/** Chat presentation helpers (pure — no React). Arabic-first formatting for the messages UI. */

export type ChatAttachmentKind = "image" | "video" | "audio" | "document" | "archive" | "other";

/** Normalized attachment ref carried on a message (from REST `attachments` or Firestore `files`). */
export type ChatAttachment = {
  id: number;
  kind: ChatAttachmentKind;
  name: string;
  size: number;
};

/** Unified message shape the bubbles render, normalized from either transport. */
export type ChatMessage = {
  id: string | number;
  body: string;
  attachments: ChatAttachment[];
  mine: boolean;
  created_at: string;
};

/** Context tag shown on conversation rows. */
export const CTX_LABEL: Record<string, string> = {
  contract: "عقد",
  proposal: "وظيفة",
  service: "خدمة",
  direct: "مباشرة",
};

/** Which filter pill a conversation belongs to. الوظائف = عقد/وظيفة، الخدمات = خدمة. */
export type ConvFilter = "all" | "jobs" | "services";

export function matchesFilter(contextType: string, filter: ConvFilter): boolean {
  if (filter === "all") return true;
  if (filter === "jobs") return contextType === "contract" || contextType === "proposal";
  return contextType === "service";
}

/** Relative Arabic timestamp for the conversation list (الآن / منذ ١٠ دقائق / أمس / تاريخ). */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `منذ ${diffH} ساعة`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "أمس";
  if (diffD < 7) return `منذ ${diffD} أيام`;
  return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "short" });
}

/** Clock time inside a bubble. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

/** Human file size, e.g. "1.2 MB". */
export function fmtSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** mm:ss for an audio/recording duration in seconds. */
export function fmtDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
