/* Client-side mirror of the backend contact guard (apps/core/contact_guard.py) — a soft hint so
   users learn before submit that external contact details (phone/email/links/handles) aren't
   allowed in public free text. The server is the real enforcement; this is UX only. */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const PATTERNS: RegExp[] = [
  // email (incl. simple obfuscation)
  /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\bat\b)\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\)|\bdot\b)\s*[A-Za-z]{2,}/i,
  // links + bare domains
  /(?:https?:\/\/|www\.)\S+|\b[A-Za-z0-9-]+\.(?:com|net|org|io|me|co|info|biz|app|link|sa|kw|ae|eg|qa|bh|om)\b/i,
  // phone (7+ digit run)
  /\+?\d(?:[\d\s\-().]{5,})\d/,
  // messaging handles — Latin (no boundary needed)
  /(?:whats\s?app|wa\.me|t\.me|tele\s?gram|insta\s?gram|snap\s?chat|@[A-Za-z0-9_.]{3,})/i,
  // messaging handles — Arabic, bounded by Arabic-letter lookarounds so e.g. "رقمي" doesn't match
  // inside "الرقمية" (digital) or similar unrelated words (false positives).
  /(?<![ء-ي])(?:واتس(?:اب)?|تلي?[غج]رام|انست[غا]رام?|سناب(?:\s?شات)?|راسلني|كلمني|تواصل\s?مع[يى]?|رقم[يى]|جوال[يى]|بريد[يى]|ايميل[يى]?)(?![ء-ي])/,
];

/** True if the text appears to contain an email, phone, URL, or messaging handle. */
export function hasContactInfo(text: string): boolean {
  if (!text) return false;
  const norm = text.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  return PATTERNS.some((re) => re.test(norm));
}
