"use client";

import { useRef, useState } from "react";

import { uploadFile, type Attachment } from "@/lib/api";
import { apiError } from "@/lib/errors";
import { PaperclipIcon } from "@/components/icons";

type Props = {
  onUploaded: (attachment: Attachment) => void;
  accept?: string; // e.g. "image/*,application/pdf"
  maxMb?: number; // client-side pre-check only — the server is the source of truth
  multiple?: boolean;
  label?: string;
};

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
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    for (const file of Array.from(files)) {
      if (file.size > maxMb * 1024 * 1024) {
        setError(`حجم «${file.name}» يتجاوز ${maxMb}MB`);
        continue;
      }
      setBusy(true);
      try {
        onUploaded(await uploadFile(file));
      } catch (e) {
        setError(apiError(e).message_ar);
      } finally {
        setBusy(false);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div dir="rtl">
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-busy={busy}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
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
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
