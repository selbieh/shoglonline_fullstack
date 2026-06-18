# Design QA Report — UI v2 (Code-Based)

**Date:** June 12, 2026 · **Method:** headless Chromium render of all 45 pages at 1440px (desktop) and 390px (mobile) = 90 full-page screenshots, plus automated horizontal-overflow and console-error checks.

## Results

| Check | Result |
|---|---|
| All 44 screens + index render without page errors | ✅ Pass |
| RTL layout (no LTR leaks, correct alignment) | ✅ Pass (visual sample: 14 screens) |
| Palette fidelity to original (#6C70DC family) | ✅ Pass |
| Horizontal overflow at 390px | ✅ Pass after 3 fixes (below) |
| Horizontal overflow at 1440px | ✅ Pass |
| Modals (charge, accept-proposal, review, new-ticket, reject) | ✅ Render correctly as overlay states |
| Mobile stacking (cols → single column, tables → cards, bottom tabs) | ✅ Pass |
| Status chips match SRS §9.10 state machines | ✅ Pass (styleguide reference section) |

## Fixes applied during QA
1. **Header overflow @390px (93px)** — mode toggle too wide on mobile → compact toggle (active segment + ⇄), smaller logo/avatar/icons ≤480px.
2. **Action-row overflows (job-post 46px, my-jobs 68px)** — `.row`/`.row-between` now wrap at ≤480px (header and chat input excluded).
3. **Tabs overflow** — `.tabs` horizontally scrollable with `flex: none` buttons.

## Known sandbox-only artifacts (not bugs)
- Google Fonts (Tajawal) blocked by sandbox network → screenshots use fallback font; loads normally in real browsers.
- Emoji render as boxes in headless shell (no emoji font installed); fine in real browsers.

## How to review
Open `design/index.html` in any browser → gallery of all screens. Resize to 390px width for mobile preview. Screenshots archive: session outputs `qa_shots2/` (90 PNGs).
