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
    gallery: "Works gallery",
    signin: "Sign in",
    dashboard: "Dashboard",
    home: "Go to homepage",
  },
  footer: {
    cols: {
      important: "Important links",
      support: "Support",
      contact: "Contact us",
    },
    links: {
      home: "Home",
      about: "About us",
      services: "Services",
      jobs: "Jobs",
      faq: "FAQ",
      techSupport: "Technical support",
      privacy: "Privacy policy",
      terms: "Terms & conditions",
    },
    contact: {
      emailLabel: "Email",
      email: "support@shoglonline.com",
      phoneLabel: "Phone",
      phone: "+20 123 456 7890",
      addressLabel: "Address",
      address: "Street, City, Country",
    },
    apps: {
      appStoreLead: "Download on the",
      appStore: "App Store",
      googlePlayLead: "GET IT ON",
      googlePlay: "Google Play",
    },
  },
};
