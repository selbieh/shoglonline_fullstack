# PART 08 — i18n Externalization & SEO

**Goal:** remove hard-coded strings (NFR-LOC-2 is currently violated) and make public pages
SEO-grade. This is an acceptance gate (AC-2, AC-12).
**Depends on:** Part 07 (pages exist to localize) + Part 06 (public profile endpoint).
**SRS refs:** NFR-LOC-1/2/3, FR-CMS-1/2, §17, AC-2/AC-12/AC-14. **Reference:** GAP §2.2/2.3, Phase 14.
**Effort:** L

## Steps

### i18n (frontend)
1. [ ] Adopt `next-intl`: create an `ar` message catalog; wrap the app in the provider; locale-aware URL strategy reserved (default-locale root, future `/en`). No layout rework — RTL already uses logical properties; complete the logical-property migration where physical `left/right` remain.
2. [ ] Extract every hard-coded Arabic string from pages/components/`lib` into the catalog (validation messages, labels, empty states, errors). Add an ESLint rule / CI check that fails on literal Arabic strings in JSX.

### i18n (backend)
3. [ ] Wrap user-facing strings (API error `message_ar`, emails, notifications, validation) in Django `gettext`; add `LocaleMiddleware`; generate the `ar` `.po`/`.mo`. Make admin-managed content translation-ready (JSON translation columns or `django-modeltranslation`) per FR-CMS-4.

### SEO / SSR
4. [x] Server-render public pages with full metadata: jobs list + `/jobs/[slug]` (**JobPosting** JSON-LD with `validThrough`/`410` on expiry — FR-JOB-17/§17), services + `/services/[slug]` (**Product/Offer**), public worker profile (**Person**), CMS pages, FAQ (**FAQPage**). Canonical + robots + `hreflang`-ready.
5. [x] Dynamic `sitemap.xml` (fresh after publish/expiry) + `robots.txt`; `next-sitemap` or route handlers. (`app/sitemap.ts` + `app/robots.ts` already exist — extend to real data.)
6. [ ] Maintenance mode returns 503 + Retry-After to crawlers (coordinate with Part 04 middleware).

### a11y & responsive audit (NFR-UX)
7. [ ] WCAG 2.1 AA pass: semantic landmarks, contrast, keyboard nav, alt text, correct `lang`/`dir`. Responsive verification at **360 / 768 / 1280 / 1920** with no horizontal scroll, ≥44px touch targets. All destructive actions confirm; all mutations show success/error feedback.

## Tests to add
- Frontend: `i18n` smoke — stub a second locale and assert pages render with no missing keys (**AC-2**: adding a locale needs no schema/layout change). ESLint "no literal Arabic in JSX" gate.
- Backend: assert error/email strings resolve through `gettext` (catalog has keys).
- SEO: JSON-LD validity tests (JobPosting/FAQPage/Person shape); sitemap includes published + excludes expired/410; Lighthouse-CI budget job (SEO ≥ 95) on key templates (**AC-12**).
- a11y: axe checks on landing/jobs/services/profile in component tests; Playwright viewport matrix (Part 11).

## Exit criteria (maps **AC-2 / AC-12 / AC-14**)
- [ ] No untranslated/hard-coded strings (lint gate green); a stub second locale loads with no missing keys and no layout change.
- [ ] Valid JobPosting/FAQPage/Person JSON-LD (Rich Results); sitemaps fresh after publish; canonical/robots correct; Lighthouse SEO ≥ 95 on key templates.
- [ ] Critical flows verified at 360/768/1280/1920 with no horizontal scroll.
