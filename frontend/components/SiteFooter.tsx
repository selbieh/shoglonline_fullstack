import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { BoltIcon, LockIcon, ShieldIcon } from "@/components/icons";

/** Brand footer for the landing page. */
export default function SiteFooter() {
  const t = getMessages();
  const fl = t.footer.links;
  const cols: { h: string; links: [string, string][] }[] = [
    { h: t.footer.cols.platform, links: [[fl.jobs, "/jobs"], [fl.services, "/services"], [fl.freelancers, "/freelancers"]] },
    { h: t.footer.cols.account, links: [[fl.signin, "/signin"], [fl.dashboard, "/dashboard"], [fl.wallet, "/wallet"]] },
    { h: t.footer.cols.support, links: [[fl.faq, "/faq"], [fl.supportCenter, "/support"], [fl.contracts, "/contracts"]] },
  ];

  return (
    <footer className="bg-primary-deep text-tint">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-content-center rounded-m bg-white/15 font-extrabold text-white">ش</span>
            <span className="text-lg font-extrabold text-white">{t.brand}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-tint/75">
            {t.footer.tagline}
          </p>
          <div className="mt-4 flex gap-2">
            {[
              { Icon: ShieldIcon, b: t.footer.badges.escrow },
              { Icon: BoltIcon, b: t.footer.badges.instant },
              { Icon: LockIcon, b: t.footer.badges.secure },
            ].map(({ Icon, b }) => (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
                <Icon className="text-[13px]" /> {b}
              </span>
            ))}
          </div>
        </div>

        {cols.map((c) => (
          <div key={c.h}>
            <h3 className="font-bold text-white">{c.h}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-tint/75 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-5 text-sm text-tint/70 sm:flex-row">
          <span>© {new Date().getFullYear()} {t.brand} — {t.footer.rights}</span>
          <span className="inline-flex items-center gap-1.5"><ShieldIcon className="text-[14px]" /> {t.footer.madeWith}</span>
        </div>
      </div>
    </footer>
  );
}
