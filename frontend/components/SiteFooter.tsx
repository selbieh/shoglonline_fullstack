"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import Logo from "@/components/Logo";
import {
  AppleIcon, FacebookIcon, GooglePlayIcon, InstagramIcon, LinkedinIcon, TwitterIcon, YoutubeIcon,
} from "@/components/icons";

type IconCmp = (props: { className?: string }) => JSX.Element;

/** Dark store badge (App Store / Google Play). Brand text stays LTR even in the RTL footer. */
function StoreBadge({ lead, name, Icon }: { lead: string; name: string; Icon: IconCmp }) {
  return (
    <a
      href="#"
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

/** Site footer — periwinkle, matches the client PDF: link columns + contact + socials + app badges. */
export default function SiteFooter() {
  const pathname = usePathname() || "/";
  // Skip on full-bleed flows that own the whole viewport (mirrors SiteHeader's skip pattern).
  if (pathname.startsWith("/signin") || pathname.startsWith("/onboarding")) return null;

  const t = getMessages();
  const fl = t.footer.links;
  const c = t.footer.contact;

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

  const socials: { Icon: IconCmp; label: string }[] = [
    { Icon: FacebookIcon, label: "Facebook" },
    { Icon: TwitterIcon, label: "Twitter" },
    { Icon: InstagramIcon, label: "Instagram" },
    { Icon: YoutubeIcon, label: "YouTube" },
    { Icon: LinkedinIcon, label: "LinkedIn" },
  ];

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
            <li>
              {c.emailLabel}: <a href={`mailto:${c.email}`} className="transition hover:text-white" dir="ltr">{c.email}</a>
            </li>
            <li>
              {c.phoneLabel}: <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="transition hover:text-white" dir="ltr">{c.phone}</a>
            </li>
            <li>{c.addressLabel}: {c.address}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-5 px-6 py-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Logo tone="light" className="h-7 w-auto" />
            <span className="text-sm text-white/80">{new Date().getFullYear()}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {socials.map(({ Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="grid h-9 w-9 place-content-center rounded-full bg-white/15 text-[18px] text-white transition hover:bg-white hover:text-primary"
              >
                <Icon />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <StoreBadge lead={t.footer.apps.appStoreLead} name={t.footer.apps.appStore} Icon={AppleIcon} />
            <StoreBadge lead={t.footer.apps.googlePlayLead} name={t.footer.apps.googlePlay} Icon={GooglePlayIcon} />
          </div>
        </div>
      </div>
    </footer>
  );
}
