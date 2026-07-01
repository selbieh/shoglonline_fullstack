"use client";

import { useEffect, useRef } from "react";

/**
 * Shared keyboard/focus behaviour for our overlay dialogs (role="dialog" aria-modal).
 * While `open` is true it: closes on Escape, locks background scroll, moves focus into
 * the dialog on open, and restores focus to the previously-focused element (the trigger)
 * on close. Attach the returned ref to the dialog container element and give it
 * `tabIndex={-1}` so it can receive focus. Mirrors the pattern in MediaGallery's Lightbox.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  // keep the latest onClose without re-running the effect (avoids re-binding on every render)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocused?.focus?.();
    };
  }, [open]);

  return ref;
}
