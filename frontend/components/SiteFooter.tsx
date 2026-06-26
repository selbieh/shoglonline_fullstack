"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import Logo from "@/components/Logo";
import {
  AppleIcon, FacebookIcon, GooglePlayIcon, InstagramIcon, LinkedinIcon, TwitterIcon, YoutubeIcon,
} from "@/components/icons";

type IconCmp = (props: { className?: string }) => JSX.Element;

/** Admin-controlled footer settings (GET /api/v1/site-settings). Blank string = hide that entry. */
export type SiteSettings = {
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  app_store_url: string;
  google_play_url: string;
  facebook_url: string;
  twitter_url: string;
  instagram_url: string;
  youtube_url: string;
  linkedin_url: string;
};

/** Dark store badge (App Store / Google Play). Brand text stays LTR even in the RTL footer. */
function StoreBadge({ href, lead, name, Icon }: { href: string; lead: string; name: string; Icon: IconCmp }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-black/85 px-3 py-1.5 text-white transition hover:bg-black"
      dir="ltr"
    >
      <Icon className="text-[22px]" />
      <span className="text-start leading-tight">
        <span className="block text-[9px] uppercase tracking-wide opacity-80">{lead}</span>
        <span className="block text-sm font-semibold">{name}</span>
      </span>
    </a>
  );
}

/**
 * Site footer — periwinkle, matches the client PDF: link columns + contact + socials + app badges.
 * Contact details, app-store links, and social URLs come from the admin (`settings`); any blank
 * value is hidden. When `settings` is null (fetch failed) we fall back to the i18n contact defaults
 * so the footer never renders broken.
 */
export default function SiteFooter({ settings }: { settings?: SiteSettings | null }) {
  const pathname = usePathname() || "/";
  // Skip on full-bleed flows that own the whole viewport (mirrors SiteHeader's skip pattern).
  if (pathname.startsWith("/signin") || pathname.startsWith("/onboarding")) return null;

  const t = getMessages();
  const fl = t.footer.links;
  const c = t.footer.contact;

  // Source of truth = admin settings. On fetch failure (null) fall back to the i18n defaults.
  const email = settings ? settings.contact_email : c.email;
  const phone = settings ? settings.contact_phone : c.phone;
  const address = settings ? settings.contact_address : c.address;

  const cols: { h: string; links: [string, string][] }[] = [
    {
      h: t.footer.cols.important,
      links: [[fl.home, "/"], [fl.about, "/pages/about"], [fl.services, "/services"], [fl.jobs, "/jobs"]],
    },
    {
      h: t.footer.cols.support,
      links: [[fl.faq, "/faq"], [fl.techSupport, "/support"], [fl.privacy, "/pages/privacy"], [fl.terms, "/pages/terms"]],
    },
  ];

  const socials: { Icon: IconCmp; label: string; url: string }[] = [
    { Icon: FacebookIcon, label: "Facebook", url: settings?.facebook_url ?? "" },
    { Icon: TwitterIcon, label: "Twitter", url: settings?.twitter_url ?? "" },
    { Icon: InstagramIcon, label: "Instagram", url: settings?.instagram_url ?? "" },
    { Icon: YoutubeIcon, label: "YouTube", url: settings?.youtube_url ?? "" },
    { Icon: LinkedinIcon, label: "LinkedIn", url: settings?.linkedin_url ?? "" },
  ].filter((s) => s.url);

  const appStoreUrl = settings?.app_store_url ?? "";
  const googlePlayUrl = settings?.google_play_url ?? "";

  return (
    <footer className="bg-primary text-white">
      <div className="mx-auto grid max-w-screen-2xl gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-3">
        {cols.map((col) => (
          <div key={col.h}>
            <h3 className="font-bold text-white">{col.h}</h3>
            <ul className="mt-4 space-y-2.5 text-[15px]">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="font-medium text-white/90 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h3 className="font-bold text-white">{t.footer.cols.contact}</h3>
          <ul className="mt-4 space-y-2.5 text-[15px] font-medium text-white/90">
            {email && (
              <li>
                {c.emailLabel}: <a href={`mailto:${email}`} className="transition hover:text-white" dir="ltr">{email}</a>
              </li>
            )}
            {phone && (
              <li>
                {c.phoneLabel}: <a href={`tel:${phone.replace(/\s/g, "")}`} className="transition hover:text-white" dir="ltr">{phone}</a>
              </li>
            )}
            {address && <li>{c.addressLabel}: {address}</li>}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-5 px-6 py-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo tone="light" className="h-7 w-auto" />
            <span className="text-sm text-white/80">{new Date().getFullYear()}</span>
          </div>

          {socials.length > 0 && (
            <div className="flex items-center gap-2.5">
              {socials.map(({ Icon, label, url }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid h-9 w-9 place-content-center rounded-full bg-white/15 text-[18px] text-white transition hover:bg-white hover:text-primary"
                >
                  <Icon />
                </a>
              ))}
            </div>
          )}

          {(appStoreUrl || googlePlayUrl) && (
            <div className="flex items-center gap-2.5">
              {appStoreUrl && (
                <StoreBadge href={appStoreUrl} lead={t.footer.apps.appStoreLead} name={t.footer.apps.appStore} Icon={AppleIcon} />
              )}
              {googlePlayUrl && (
                <StoreBadge href={googlePlayUrl} lead={t.footer.apps.googlePlayLead} name={t.footer.apps.googlePlay} Icon={GooglePlayIcon} />
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
