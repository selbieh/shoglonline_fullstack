import type { Messages } from "./ar";

/**
 * English stub (reserved second locale, NFR-LOC-2). It mirrors `ar`'s key shape exactly — the
 * i18n key-parity test fails if a key is missing — proving a new locale needs no schema/layout
 * change (AC-2). Values are placeholders until the product ships English.
 */
export const en: Messages = {
  brand: "ShoghlOnline",
  nav: {
    jobs: "Jobs",
    services: "Services",
    freelancers: "Freelancers",
    signin: "Sign in",
    dashboard: "Dashboard",
    home: "Go to homepage",
  },
  footer: {
    tagline: "An Arabic marketplace connecting businesses with freelancers — jobs, services, and escrow-secured payments.",
    rights: "All rights reserved",
    madeWith: "Built with escrow-protected payments",
    badges: { escrow: "Escrow", instant: "Instant", secure: "Secure" },
    cols: {
      platform: "Platform",
      account: "Account",
      support: "Support",
    },
    links: {
      jobs: "Jobs",
      services: "Services",
      freelancers: "Freelancers",
      signin: "Sign in",
      dashboard: "Dashboard",
      wallet: "Wallet",
      faq: "FAQ",
      supportCenter: "Support center",
      contracts: "Contracts",
    },
  },
};
