/**
 * Country dialing codes for the phone/WhatsApp country-code dropdown.
 *
 * Israel (IL / +972) is intentionally omitted — a product rule mirrored on the backend, which
 * rejects +972 in `apps/core/phone.py` so a raw API call can't bypass the dropdown. Arab / GCC
 * countries are listed first (the platform's primary audience), the rest follow.
 */
import { toAsciiDigits } from "@/lib/arabic";

export type Country = { iso: string; dial: string; ar: string };

export const DEFAULT_DIAL = "+966"; // Saudi Arabia — the app's default region.

export const COUNTRIES: Country[] = [
  // GCC + Arab world (primary audience)
  { iso: "SA", dial: "+966", ar: "السعودية" },
  { iso: "AE", dial: "+971", ar: "الإمارات" },
  { iso: "KW", dial: "+965", ar: "الكويت" },
  { iso: "QA", dial: "+974", ar: "قطر" },
  { iso: "BH", dial: "+973", ar: "البحرين" },
  { iso: "OM", dial: "+968", ar: "عُمان" },
  { iso: "EG", dial: "+20", ar: "مصر" },
  { iso: "JO", dial: "+962", ar: "الأردن" },
  { iso: "LB", dial: "+961", ar: "لبنان" },
  { iso: "IQ", dial: "+964", ar: "العراق" },
  { iso: "SY", dial: "+963", ar: "سوريا" },
  { iso: "PS", dial: "+970", ar: "فلسطين" },
  { iso: "YE", dial: "+967", ar: "اليمن" },
  { iso: "SD", dial: "+249", ar: "السودان" },
  { iso: "LY", dial: "+218", ar: "ليبيا" },
  { iso: "TN", dial: "+216", ar: "تونس" },
  { iso: "DZ", dial: "+213", ar: "الجزائر" },
  { iso: "MA", dial: "+212", ar: "المغرب" },
  { iso: "MR", dial: "+222", ar: "موريتانيا" },
  { iso: "SO", dial: "+252", ar: "الصومال" },
  { iso: "DJ", dial: "+253", ar: "جيبوتي" },
  { iso: "KM", dial: "+269", ar: "جزر القمر" },
  // Rest of the world
  { iso: "TR", dial: "+90", ar: "تركيا" },
  { iso: "IR", dial: "+98", ar: "إيران" },
  { iso: "AF", dial: "+93", ar: "أفغانستان" },
  { iso: "PK", dial: "+92", ar: "باكستان" },
  { iso: "IN", dial: "+91", ar: "الهند" },
  { iso: "BD", dial: "+880", ar: "بنغلاديش" },
  { iso: "LK", dial: "+94", ar: "سريلانكا" },
  { iso: "NP", dial: "+977", ar: "نيبال" },
  { iso: "CN", dial: "+86", ar: "الصين" },
  { iso: "JP", dial: "+81", ar: "اليابان" },
  { iso: "KR", dial: "+82", ar: "كوريا الجنوبية" },
  { iso: "ID", dial: "+62", ar: "إندونيسيا" },
  { iso: "MY", dial: "+60", ar: "ماليزيا" },
  { iso: "SG", dial: "+65", ar: "سنغافورة" },
  { iso: "PH", dial: "+63", ar: "الفلبين" },
  { iso: "TH", dial: "+66", ar: "تايلاند" },
  { iso: "VN", dial: "+84", ar: "فيتنام" },
  { iso: "AZ", dial: "+994", ar: "أذربيجان" },
  { iso: "US", dial: "+1", ar: "الولايات المتحدة" },
  { iso: "CA", dial: "+1", ar: "كندا" },
  { iso: "GB", dial: "+44", ar: "المملكة المتحدة" },
  { iso: "FR", dial: "+33", ar: "فرنسا" },
  { iso: "DE", dial: "+49", ar: "ألمانيا" },
  { iso: "IT", dial: "+39", ar: "إيطاليا" },
  { iso: "ES", dial: "+34", ar: "إسبانيا" },
  { iso: "NL", dial: "+31", ar: "هولندا" },
  { iso: "BE", dial: "+32", ar: "بلجيكا" },
  { iso: "CH", dial: "+41", ar: "سويسرا" },
  { iso: "AT", dial: "+43", ar: "النمسا" },
  { iso: "SE", dial: "+46", ar: "السويد" },
  { iso: "NO", dial: "+47", ar: "النرويج" },
  { iso: "DK", dial: "+45", ar: "الدنمارك" },
  { iso: "FI", dial: "+358", ar: "فنلندا" },
  { iso: "IE", dial: "+353", ar: "أيرلندا" },
  { iso: "PT", dial: "+351", ar: "البرتغال" },
  { iso: "GR", dial: "+30", ar: "اليونان" },
  { iso: "PL", dial: "+48", ar: "بولندا" },
  { iso: "RO", dial: "+40", ar: "رومانيا" },
  { iso: "CZ", dial: "+420", ar: "التشيك" },
  { iso: "HU", dial: "+36", ar: "المجر" },
  { iso: "RU", dial: "+7", ar: "روسيا" },
  { iso: "UA", dial: "+380", ar: "أوكرانيا" },
  { iso: "AU", dial: "+61", ar: "أستراليا" },
  { iso: "NZ", dial: "+64", ar: "نيوزيلندا" },
  { iso: "ZA", dial: "+27", ar: "جنوب أفريقيا" },
  { iso: "NG", dial: "+234", ar: "نيجيريا" },
  { iso: "KE", dial: "+254", ar: "كينيا" },
  { iso: "ET", dial: "+251", ar: "إثيوبيا" },
  { iso: "GH", dial: "+233", ar: "غانا" },
  { iso: "TZ", dial: "+255", ar: "تنزانيا" },
  { iso: "UG", dial: "+256", ar: "أوغندا" },
  { iso: "BR", dial: "+55", ar: "البرازيل" },
  { iso: "AR", dial: "+54", ar: "الأرجنتين" },
  { iso: "MX", dial: "+52", ar: "المكسيك" },
  { iso: "CL", dial: "+56", ar: "تشيلي" },
  { iso: "CO", dial: "+57", ar: "كولومبيا" },
  { iso: "PE", dial: "+51", ar: "بيرو" },
];

// Unique dial codes, longest first, so "+1" never shadows "+971" when matching a prefix.
const DIALS_BY_LENGTH = Array.from(new Set(COUNTRIES.map((c) => c.dial))).sort(
  (a, b) => b.length - a.length,
);

/** Split a stored E.164-ish value ("+966512345678") into its dial code and the local number. */
export function splitPhone(
  full: string | null | undefined,
  defaultDial: string = DEFAULT_DIAL,
): { dial: string; number: string } {
  const raw = toAsciiDigits(String(full ?? "")).replace(/\s+/g, "");
  if (raw.startsWith("+")) {
    const dial = DIALS_BY_LENGTH.find((d) => raw.startsWith(d));
    if (dial) return { dial, number: raw.slice(dial.length).replace(/\D/g, "") };
  }
  return { dial: defaultDial, number: raw.replace(/\D/g, "") };
}

/** Join a dial code + local number into the canonical "+<cc><digits>" the backend expects. Returns
 *  "" when there is no number, so an empty field stores "" rather than a bare dial code. */
export function joinPhone(dial: string, number: string): string {
  const digits = toAsciiDigits(String(number ?? "")).replace(/\D/g, "");
  return digits ? `${dial}${digits}` : "";
}
