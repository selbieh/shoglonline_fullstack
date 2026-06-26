import { hasContactInfo } from "@/lib/contactGuard";

/* Soft inline warning shown under a free-text field when it seems to contain external contact
   info (phone/email/link/handle). Advisory only.
   - mode="block"  (default): the backend rejects the text on save (gigs/profiles/proposals).
   - mode="review": the backend doesn't reject — it diverts the post to admin review before it
     goes live (jobs, see services.submit_for_publication). */
export default function ContactHint({ text, mode = "block" }: { text: string; mode?: "block" | "review" }) {
  if (!hasContactInfo(text)) return null;
  return (
    <p className="mt-1 text-xs font-medium text-warn">
      {mode === "review"
        ? "تنبيه: يبدو أن النص يحتوي وسائل تواصل خارجية (هاتف، بريد، روابط، أو حسابات تواصل) — قد تخضع الوظيفة لمراجعة الإدارة قبل النشر. التواصل والتعاقد داخل المنصة فقط."
        : "تنبيه: لا تُدرج وسائل تواصل خارجية (هاتف، بريد، روابط، أو حسابات تواصل) — سيُرفض النص عند الحفظ."}
    </p>
  );
}
