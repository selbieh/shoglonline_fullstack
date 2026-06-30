"use client";

import { useRef, useState } from "react";

import { uploadFile, type Attachment } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { PaperclipIcon } from "@/components/icons";

type Props = {
  // `previewUrl` is a local object URL for the just-picked image (instant preview without a network
  // round-trip). It's only set for image files; revoke it when you no longer render it.
  onUploaded: (attachment: Attachment, previewUrl?: string) => void;
  accept?: string; // e.g. "image/*,application/pdf"
  maxMb?: number; // client-side pre-check only — the server is the source of truth
  multiple?: boolean;
  label?: string;
  hint?: string; // small dimension/size recommendation shown under the dropzone
};

/**
 * Returns true when `file` matches the comma-separated `accept` allowlist (the same syntax as the
 * <input accept> attribute: exact MIME types, wildcard groups like `image/*`, and `.ext` suffixes).
 * An empty/undefined allowlist accepts everything. This is a fast client pre-check only — the
 * backend stays the source of truth and re-validates the MIME on upload.
 */
function isAcceptedType(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
}

/**
 * Reusable upload control (drag/drop + click, RTL Arabic). Pre-checks size client-side for fast
 * feedback, then POSTs to /uploads; the backend re-validates flag/size/MIME and returns the
 * attachment, which the parent links to its host via `attachment_ids` on create.
 */
export default function FileUpload({
  onUploaded,
  accept,
  maxMb = 25,
  multiple = true,
  label = "أرفق ملفًا",
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    // Toggle busy once around the whole batch (not per file, which flickers the label) and
    // collect every failure so one rejected file doesn't overwrite the others' messages.
    const failures: string[] = [];
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxMb * 1024 * 1024) {
          failures.push(`حجم «${file.name}» يتجاوز ${maxMb}MB`);
          continue;
        }
        // `accept` only filters the file picker, not drag-drop — re-check the MIME here so an
        // unsupported file fails fast instead of round-tripping to the server.
        if (!isAcceptedType(file, accept)) {
          failures.push(`نوع «${file.name}» غير مسموح به`);
          continue;
        }
        try {
          // Render a local preview from the picked file: the server `url` is a scoped, auth-only
          // download endpoint that a plain <img> can't load (no Bearer header), so it'd show broken.
          const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
          onUploaded(await uploadFile(file), preview);
        } catch (e) {
          failures.push(`«${file.name}»: ${apiError(e).message_ar}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (failures.length) setError(failures.join(" · "));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div dir="rtl">
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-busy={busy}
        onClick={(e) => {
          // When this control sits inside a <label> (e.g. our Field wrapper), a click both runs
          // this handler AND triggers the label's default activation of the file input — opening
          // the picker twice. preventDefault cancels the implicit forward; we open it explicitly.
          e.preventDefault();
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-m border border-dashed p-4 text-center text-sm ${
          dragOver ? "border-primary bg-tint" : "border-line-strong text-sub"
        }`}
      >
        {busy ? (
          "جارٍ الرفع…"
        ) : (
          <span className="inline-flex items-center gap-1.5"><PaperclipIcon className="text-[15px]" /> {label} — اسحب وأفلت أو انقر للاختيار</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      {hint && !error && <p className="mt-1.5 text-xs text-sub">{hint}</p>}
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
}
