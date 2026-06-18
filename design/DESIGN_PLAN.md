# ShoghlOnline — Design Plan v1.0 (Code-Based Design System)

> Source of truth for the UI. Built without Figma as responsive RTL HTML/CSS in `design/`.
> Functional contract: **SRS v1.1** (`ShoghlOnline_SRS_v1.1.docx`). Visual guide: original 77-screen Figma export + the Figma UI v2 file (13 screens).
> Stack alignment: every token/component here maps 1:1 to the future Next.js implementation.

---

## 1. Design Principles

1. **Arabic-first, RTL everywhere** — `dir="rtl" lang="ar"`, Tajawal typeface, Arabic-Indic numerals in content (Latin digits in code/amounts where clearer).
2. **Mode is a lens, never a wall** (SRS §3.1) — the Worker/Employer toggle is in every header; no screen forces a switch; cross-role deep links always work.
3. **Money rules visible** — escrow, commission, warranty, bid deduction and refunds appear as inline microcopy at the point of action, not buried in help pages.
4. **State machines on-screen** — every entity shows its SRS §9.10 status as a colored chip; nothing is ambiguous.
5. **Confirm destructive, explain blocked** — reject/cancel/dispute/delete always show reason fields or blocker lists (BR-2, BR-22).
6. **One design = one codebase** — these CSS tokens and components are the development handoff; no redrawing.

## 2. Design Tokens (`assets/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--c-primary` | `#6C70DC` | Brand, primary buttons, active states |
| `--c-primary-dark` | `#5155BE` | Links, small text on white (WCAG), hover |
| `--c-primary-deep` | `#3E418F` | Pressed, high-contrast accents |
| `--c-tint` | `#E9ECFA` | Tinted surfaces, info banners, chips |
| `--c-bg` | `#F6F7FD` | Page background |
| `--c-surface` | `#FFFFFF` | Cards |
| `--c-ink` | `#23263F` | Headings, body |
| `--c-sub` | `#5D6275` | Secondary text (AA on white & bg) |
| `--c-line` | `#DADDEC` | Borders, dividers |
| `--c-success` / `--c-success-t` | `#1B8A5A` / `#E3F5EC` | Accepted, balances, published |
| `--c-warn` / `--c-warn-t` | `#9A6A08` / `#FCF3DD` | Pending, holds, warranty |
| `--c-danger` / `--c-danger-t` | `#D93843` / `#FCE9EA` | Reject, disputes, danger zone |
| `--c-footer` | `#6C70DC` | Footer surface (white text) |
| Radii | `--r-s:8px --r-m:12px --r-l:18px --r-pill:999px` | |
| Spacing scale | `4 8 12 16 20 24 32 40 56 80` (px) | `--sp-1..--sp-10` |
| Type scale | 34/26/20/17/15/13/11 — Bold/Bold/Bold/Med/Reg/Reg/Reg | h1..caption |
| Shadow | `--sh-card: 0 1px 3px rgb(35 38 63 / 6%)` | cards |
| Breakpoints | ≤480 mobile · 481–960 tablet · >960 desktop | mobile-first CSS |

Accessibility deltas vs original: small text/links use `#5155BE` (not `#6C70DC`); secondary text darkened to `#5D6275`; success/warn/danger text shades chosen for ≥4.5:1 on their tints.

## 3. Component Inventory (`assets/components.css`)

Buttons (primary/secondary/ghost/danger/success/disabled) · Inputs (text, textarea, select, search, with error+hint states) · Checkbox/Radio/Switch · Chips (status set mapped to §9.10) · Cards (job, service, proposal, submission, stat, balance, plan) · Header (worker/employer via `shell.js`) + mobile drawer · Mode toggle · Footer · Tabs · Stepper (wizard + contract status) · Table (transactions, RTL) · Modal + overlay · Toast/banner (info/success/warn/danger) · Empty state · Skeleton loader · Pagination · Avatar + verified badge · Star rating (display + input + private) · Progress bar · Badge counter · Breadcrumb · Accordion (FAQ) · File chip / upload dropzone · Audio message bubble · Chat bubbles (sent/received/read receipts).

## 4. Screen Inventory (every file traced to SRS)

### A — Public (visitor)
| # | Screen | File | SRS | Key states |
|---|---|---|---|---|
| A1 | Landing | `screens/landing.html` | BO-3/5, SEO-1 | hero, categories, dual-CTA (find job / find worker) |
| A2 | Jobs list (public) | `screens/jobs-public.html` | FR-JOB-3 | sign-in prompt on apply |
| A3 | Service list (public) | reuse E-shared catalog w/ visitor bar | FR-SVC-3 | |
| A4 | Worker public profile | `screens/profile-public.html` | FR-PROF-4 | rating, portfolio, services |
| A5 | Content page | `screens/content-page.html` | FR-CMS-1 | About/Terms layout |
| A6 | FAQ | `screens/faq.html` | FR-CMS-2 | accordion |
| A7 | Maintenance | `screens/maintenance.html` | FR-ADM-3 | 503 page |
| A8 | 404 | `screens/404.html` | SEO-8 | |

### B — Auth & Onboarding
| # | Screen | File | SRS | Key states |
|---|---|---|---|---|
| B1 | Sign in (Google only) | `screens/signin.html` | FR-AUTH-1..6 | default + registration-closed + frozen-account |
| B2 | First-login consent | `screens/consent.html` | FR-AUTH-2, FR-CMS-3 | T&C checkbox gate |
| B3 | Mode selection | `screens/mode-select.html` | FR-MODE-1 | both cards, switch-anytime note |
| B4 | Worker wizard — expertise/skills | `screens/wizard-1.html` | FR-PROF-3 | progress 2/5 |
| B5 | Worker wizard — education/experience | `screens/wizard-2.html` | FR-PROF-2 | add/edit rows, skip |
| B6 | Worker wizard — rate/bio/photo + done | `screens/wizard-3.html` | FR-PROF-2 | net-fee preview, completion |

### C — Worker view (Find Job)
| # | Screen | File | SRS | Key states |
|---|---|---|---|---|
| C1 | Worker dashboard | `screens/dash-worker.html` | FR-MODE-2 | stats, active contracts, invitations |
| C2 | Jobs list (auth) | `screens/jobs.html` | FR-JOB-3/4, FR-SUB-1 | filters, watchlist hearts, subscribe banner |
| C3 | Job details + proposal | `screens/job-detail.html` | FR-JOB-5/6, FR-BID-1, BR-21 | screening required, bid counter, own-job blocked note |
| C4 | My proposals | `screens/my-proposals.html` | FR-JOB-6, BR-5 | all 7 statuses incl. withdrawn+refund |
| C5 | Invitations | `screens/invitations.html` | FR-JOB-10 | accept→proposal (free bid), reject w/ reason |
| C6 | Watchlist | `screens/watchlist.html` | FR-JOB-4 | empty state |
| C7 | My services | `screens/my-services.html` | FR-SVC-2 | live/paused/pending chips |
| C8 | Create service | `screens/service-create.html` | FR-SVC-1 | images, addons, moderation note |
| C9 | Buying requests (incoming) | `screens/service-requests-in.html` | FR-SVC-7 | accept→contract, reject w/ reason |

### D — Employer view (Find Worker)
| # | Screen | File | SRS | Key states |
|---|---|---|---|---|
| D1 | Employer dashboard | `screens/dash-employer.html` | FR-MODE-2 | my jobs, pending proposals, escrow summary |
| D2 | Post a job | `screens/job-post.html` | FR-JOB-1/2 | screening builder, moderation banner |
| D3 | My jobs | `screens/my-jobs.html` | FR-JOB-7/11/17 | lock note, repost, expiry countdown |
| D4 | Proposals management | `screens/job-proposals.html` | FR-JOB-8/9, BR-6 | private stars, sort, accept modal w/ escrow math |
| D5 | Services catalog (auth) | `screens/services.html` | FR-SVC-3/4 | filters, favourites |
| D6 | Service detail + buy | `screens/service-detail.html` | FR-SVC-5, BR-21 | addons, qty, total, own-service blocked |
| D7 | My requests (outgoing) | `screens/service-requests-out.html` | FR-SVC-6 | edit/cancel before acceptance |

### E — Shared account-level
| # | Screen | File | SRS | Key states |
|---|---|---|---|---|
| E1 | Contract (employer) | `screens/contract-employer.html` | FR-TASK-1..9 | stepper, submissions, update-request, cancel/dispute |
| E2 | Contract (worker) | `screens/contract-worker.html` | FR-TASK-3/5 | submit deliverables, request update |
| E3 | Chat | `screens/chat.html` | FR-CHAT-1..10, BR-12 | receipts, audio, 10-min banner, read-only convo |
| E4 | Wallet | `screens/wallet.html` | FR-PAY-1/9 | 3 buckets, ledger table, charge modal open |
| E5 | Withdraw + methods | `screens/withdraw.html` | FR-PAY-3/4 | hold notice, method cards, status track |
| E6 | Bids & plans | `screens/bids.html` | FR-BID-1..6 | usage, plans, refund rules |
| E7 | Invoices | `screens/invoices.html` | FR-PAY-7, BR-15 | request (worker) + confirm (employer) tabs |
| E8 | Notifications + subscriptions | `screens/notifications.html` | FR-NOT-1, FR-SUB-1..3 | unread, account-level toggles |
| E9 | Tickets | `screens/tickets.html` | FR-TKT-1..5 | 5-state chips, new-ticket modal open |
| E10 | Reviews | `screens/reviews.html` | FR-REV-1..4, BR-13 | give-review modal, edit-within-warranty, locked |
| E11 | Affiliate | `screens/affiliate.html` | FR-AFF-1..5 | stats, custom slug, share, frozen state |
| E12 | Settings + profile | `screens/settings.html` | FR-PROF-1/5/7/9 | default-view pref, deletion blockers |
| E13 | ID verification | `screens/id-verify.html` | FR-PROF-6 | upload, pending/approved/rejected |
| E14 | States showcase | `screens/states.html` | NFR-UX-3 | empty/loading/error/toast patterns |
| E15 | Style guide | `screens/styleguide.html` | — | live tokens + all components |

**Entry point:** `design/index.html` — gallery hub linking all screens, grouped A–E, with SRS refs.

## 5. Navigation Map

- **Visitor:** Landing → jobs/services/profiles (read) → any action → Sign-in (B1) → Consent (B2) → Mode (B3) → [wizard if worker] → dashboard.
- **Header (auth):** logo → dashboard · nav: الرئيسية، الوظائف، الخدمات المميزة، عقودي، المحفظة · left cluster: ModeToggle، 🔔 (badge)، 💬 (badge)، avatar-menu (الملف، الإعدادات، رصيد العروض، الفواتير، نظام الإحالة، الدعم، تسجيل الخروج).
- **Cross-role deep links:** notification about employer-side event opens employer-surface screen directly, toggle auto-reflects (FR-MODE-5).
- **Mobile:** bottom tab bar (الرئيسية، الوظائف/عروضي، +نشر، المحادثات، المحفظة) + burger drawer for the rest.

## 6. Key Flows (design-validated)

1. **Job → contract:** C2 → C3 (bid check → screening → submit) → D4 (sort/rate → accept → escrow modal: amount+commission+net) → E1/E2 active.
2. **Delivery:** E2 submit (notes+files) → E1 accept (→ completed, warranty starts, review prompt) or reject w/ reason (→ resubmit).
3. **Change/cancel:** update-request from either side (E1/E2) with old→new diff; mutual cancel two-step; dispute → ticket linked (E9) with contract flagged.
4. **Service buy:** D5 → D6 (qty+addons total) → C9 accept (→ contract) / reject reason.
5. **Money:** E4 charge (pending → confirmed states shown) → escrow on accept → release at warranty end (notification) → E5 withdraw (instant hold).
6. **Chat fallback:** E3 — unread ≥10 min → email (banner explains) → deep link returns to conversation.
7. **Category email:** C2 subscribe → notification + email on publish → C3 apply.

## 7. Responsive Rules

- Mobile-first CSS; single column ≤480px; filters collapse to a top sheet; tables become stacked cards (`data-label` pattern); chat inbox/conversation become two routes; sticky bottom CTA on forms; min tap target 44px.
- Tablet: 2-col grids, sidebar collapses to chips row.
- Desktop: max content width 1360px centered, 12-col mental grid.

## 8. Arabic Microcopy Rules

- Verbs in imperative for actions («قدّم عرضك»، «اشحن المحفظة»)، present tense for states («قيد المراجعة»).
- Numbers: Arabic-Indic for counts/dates in prose (٨ عروض), Latin allowed inside amounts with code (KWD 420.00 in tables) — pick one per surface, never mixed in one line.
- Currency: «د.ك» after amount with thin space.
- Dates: «٣٠ يونيو ٢٠٢٦» + relative («قبل ساعتين») where fresh.
- Always explain WHY something is blocked, with the next step.

## 9. QA Checklist (per screen)

RTL correct (no LTR leaks) · all statuses from §9.10 only · contrast AA · 390px and 1440px verified · empty/error covered or linked to E14 · microcopy rules · SRS ref comment in file head · no horizontal scroll.
