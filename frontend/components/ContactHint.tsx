import { hasContactInfo } from "@/lib/contactGuard";

/* Soft inline warning shown under a free-text field when it seems to contain external contact
   info (phone/email/link/handle). Advisory only — the backend rejects it on save (ppt slide-01). */
export default function ContactHint({ text }: { text: string }) {
  if (!hasContactInfo(text)) return null;
  return (
    <p className="mt-1 text-xs font-medium text-warn">
      تنبيه: لا تُدرج وسائل تواصل خارجية (هاتف، بريد، روابط، أو حسابات تواصل) — سيُرفض النص عند الحفظ.
    </p>
  );
}
