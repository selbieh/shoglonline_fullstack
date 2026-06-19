# Slide 00 — Design system & brand alignment (Phase 0, foundational)

- **Source of truth (visual):** `Sho8l online (Copy).pdf` (77 pages) + assets in `export/`.
- **Source of truth (functional):** the `ppt_gaps` slides 01–43 (from `Presentation1.pptx.pdf`).
- **Status:** ⚙️ foundational — every other slide inherits this.

## Precedence rule (read first)
`Sho8l online (Copy).pdf` is the **visual authority** — colors, styling, components, layout
language, assets — and applies **everywhere**. The `ppt_gaps` / `Presentation1.pptx` specs are
the **functional authority**. **On conflict, functional wins: adopt the PDF's *look*, skip its
conflicting *structure/content*.** Known conflicts:
- **No external contact on profiles** (`slide-01`): the Sho8l PDF profile card shows an email —
  keep the card styling, **omit** email/phone/contact.
- **Auth stays Google-only** (FR-AUTH-1): PDF shows email/password/social/OTP — keep the
  split-screen look, **skip** those controls.
- Wizard step structure follows `slides 02–10`; apply the PDF's styling to it.

## Why this slide exists
The live UI reads as "off-brand" vs the PDF. Root causes (not the primary hue — periwinkle
`#737AC9` already matches): (1) provided `export/` assets unused; (2) a ~130-spot "rainbow"
palette (emerald/amber/sky/violet/rose/teal/indigo/fuchsia) for categories/tags/KPIs/statuses;
(3) component/layout polish. This slide defines the corrected system once.

## Target palette (tokens)
| Token | Value | Use |
|-------|-------|-----|
| primary | `#737AC9` | buttons, active, hero bands, footer |
| primary-dark | `#565DAE` | links, small text on white, hover |
| primary-deep | `#424783` | avatars, dark overlays |
| tint | `#E9ECFA` | soft cards, chips, section bg |
| accent-sky | `#C6E3FF` | lavender/light-blue accents, blobs (from export) |
| accent-line | `#CEDFFF` | chip borders, soft dividers (from export) |
| bg | `#F6F7FD` | page background |
| ink | `#23263F` | body text |
| sub | `#5D6275` | secondary text |
| line / line-strong | `#DADDEC` / `#B9BED9` | borders |
| star | `#FED26C` | rating stars (was `#E8A413`) |
| logo-blue | `#1B3DBC` | **logo only**, never UI chrome |
| success / warn / danger | `#1B8A5A` / `#9A6A08` / `#D93843` (+ light tints) | **state only** |

Radii `8/12/18px`, soft shadows, font **Tajawal**, periwinkle footer, white rounded cards.

## Asset map (`export/` → `frontend/public/`)
| export file | role | wire into |
|-------------|------|-----------|
| `Layer 2 copy@2x.svg` | logo (blue wordmark + 3-people mark + ™) | `Logo.tsx` (blue on light, white via `brightness-0 invert` on periwinkle) |
| `Asset 1 1.svg` | freelancer character illustration | landing hero + "للمستقلين"/"لأصحاب الأعمال" sections (replaces hand-coded `HeroIllustration`) |
| `Frame 20–23.svg` | rating/review chips | floating chips around hero illustration |

## Palette-taming rules (Step C)
- One shared `tone(seed)` helper feeds both `lib/tags.ts` and `components/CategoryIcon.tsx`,
  returning **brand-family** tints (periwinkle/lavender/light-blue) — **not** 8 rainbow hues.
- Category band on landing = white cards + periwinkle selected state (per PDF), not multicolor.
- Statuses keep meaning via **semantic tokens only** (success/warn/danger); stars use `star`.
- Guard: no `bg-(emerald|amber|sky|violet|rose|teal|indigo|fuchsia)` outside the semantic map.

## Shared-component spec (Step D)
Buttons (`.btn-primary` periwinkle, `.btn-secondary` tint, `.btn-google` outline), `.card`
(white, `line` border, soft shadow, `r-l`), `.chip` (tint + primary-dark), `.field`
(periwinkle focus ring), tabs (primary-dark active + underline), modals (white, pop shadow),
wizard stepper (RTL per `slide-10`, periwinkle current / green done / dashed optional), tables
(tint header), `SiteFooter` (periwinkle, app-store badges).

## Per-page reskin checklist (Step E — key pages)
- [ ] Landing `app/page.tsx` — hero + character + rating chips, periwinkle category band,
  partners strip, freelancer/client sections on lavender blobs, periwinkle footer.
- [ ] Auth `app/signin/page.tsx` — split-screen periwinkle + key/stars art; **Google-only**.
- [ ] Onboarding `app/onboarding/*` — white wizard, blue logo, periwinkle التالي, bottom
  progress bar, dashed add-cards, modals (structure per `slides 02–10`).
- [ ] Profile `app/freelancers/[id]` (+ self) — 2-column PDF layout; **no contact** (`slide-01`).
- [ ] Dashboard `app/dashboard` — KPI cards, verification meter, tables in brand palette.
- [ ] Services `app/services/*` + Wallet `app/wallet` — cards/tables/buy-box/balance cards.

## Verification
`tsc` clean on changed files; user runs `npm run dev`/`build` and compares key pages to the
PDF (logo blue-on-light / white-on-periwinkle, gold stars, no rainbow tags, calm category
band). This env can't run the backend or `npm build` (prod `node_modules`; Django 4.2 vs 5.x).

## Relationship to the 43 feature slides
Build this **before/under** the feature slides — they reuse these tokens, the `tone()` helper,
shared components, the wizard stepper (`slide-10`), and the profile layout (`slides 11–12`).
