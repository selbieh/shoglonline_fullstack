/**
 * Arabic message catalog (default locale, NFR-LOC-1). Strings live here, not inline, so a second
 * locale is a drop-in (see messages/en.ts) with no layout change (AC-2). Migration is incremental:
 * shared chrome is externalized first; remaining pages move over module by module.
 */
export const ar = {
  brand: "شغل أونلاين",
  nav: {
    jobs: "الوظائف",
    services: "الخدمات",
    freelancers: "المستقلين",
    gallery: "معرض الأعمال",
    signin: "تسجيل الدخول",
    dashboard: "لوحة التحكم",
    home: "الانتقال إلى الصفحة الرئيسية",
  },
  footer: {
    cols: {
      important: "روابط هامة",
      support: "الدعم",
      contact: "تواصل معنا",
    },
    links: {
      home: "الرئيسية",
      about: "من نحن",
      services: "الخدمات",
      jobs: "الوظائف",
      faq: "الأسئلة الشائعة",
      techSupport: "الدعم الفني",
      privacy: "سياسة الخصوصية",
      terms: "الشروط والأحكام",
    },
    contact: {
      emailLabel: "البريد الإلكتروني",
      email: "support@shoglonline.com",
      phoneLabel: "الهاتف",
      phone: "+20 123 456 7890",
      addressLabel: "العنوان",
      address: "شارع، المدينة، الدولة",
    },
    apps: {
      appStoreLead: "Download on the",
      appStore: "App Store",
      googlePlayLead: "GET IT ON",
      googlePlay: "Google Play",
    },
  },
};

export type Messages = typeof ar;
