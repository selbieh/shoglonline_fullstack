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
    signin: "تسجيل الدخول",
    dashboard: "لوحة التحكم",
    home: "الانتقال إلى الصفحة الرئيسية",
  },
  footer: {
    tagline: "منصة عربية تربط أصحاب الأعمال بالمستقلين — وظائف، خدمات مميزة، ومدفوعات آمنة بنظام الضمان.",
    rights: "جميع الحقوق محفوظة",
    madeWith: "صُنع بمدفوعات محمية بنظام الضمان",
    badges: { escrow: "ضمان", instant: "آني", secure: "آمن" },
    cols: {
      platform: "المنصة",
      account: "الحساب",
      support: "الدعم",
    },
    links: {
      jobs: "الوظائف",
      services: "الخدمات",
      freelancers: "المستقلين",
      signin: "تسجيل الدخول",
      dashboard: "لوحة التحكم",
      wallet: "المحفظة",
      faq: "الأسئلة الشائعة",
      supportCenter: "مركز الدعم",
      contracts: "العقود",
    },
  },
};

export type Messages = typeof ar;
