# PART 07 — Frontend Feature Gaps

**Goal:** build the missing/placeholder UIs so the frontend matches the backend's capabilities,
each with component/page tests (MSW).
**Depends on:** Part 01 (test harness); backend APIs from Parts 03–06 where noted.
**SRS refs:** FR-PROF-1/3/4/9, FR-BID-1/2/3, FR-SUB-1, FR-NOT-1/3/4, FR-ADM, FR-PAY-4.
**Reference:** frontend audit (gaps list). **Effort:** L

## Steps (each page ships with a `__tests__/page.test.tsx`)

### Profile (entirely missing today)
1. [x] `/me/profile` edit page — avatar/cover/name/phone/address/bio + worker sections (skills w/ efficiency, education, employment, languages, hourly rate w/ net preview, portfolio via Part 03 upload). *(FR-PROF-1/2)*
2. [x] **Profile-completion wizard** `/onboarding/profile` (or modal): expertise → level → education → employment → languages → hourly rate → bio → photo → location, with Back/Skip + completeness %. *(FR-PROF-3, US-04)*
3. [x] Public worker profile `/u/[slug]` (SSR) consuming Part 06's endpoint — feeds Part 08 `Person` JSON-LD. *(FR-PROF-4)*
4. [x] Online/Offline visibility toggle + account settings (notification preferences FR-PROF-9, account deletion flow FR-PROF-7 surfacing BR-2 blockers).

### Bids (referenced but unreachable)
5. [x] `/bids` page — balance, **buy-a-plan** purchase flow (wallet-paid, instant credit), and usage history (period breakdown). The ProposalForm "out of bids" error must deep-link here. *(FR-BID-1/2/3, US-35)*

### Subscriptions (mentioned in copy only)
6. [x] Category-subscription management UI (subscribe/unsubscribe from category pages + settings; one-click email unsubscribe target page). *(FR-SUB-1, US-16)*

### Notifications
7. [x] Full **notification center** page (list, details, mark-read) beyond the bell; preferences screen (FR-PROF-9). Admin broadcast/scheduled compose lives in Unfold (Part 05), not here.

### Dashboard
8. [x] Replace the hardcoded "—" KPI placeholders with **real** mode-aware stats from `/me/...` + `/admin/stats` (worker: bids, active contracts, earnings pending; employer: open jobs, proposals, escrow held).

### Money & re-engagement
9. [x] Saved **payment methods** UI on `/wallet` (Part 06 FR-PAY-4). **Repost/Rehire** actions on the employer job views (Part 06 FR-JOB-11/12). **ID-verification** upload + badge (Part 04 FR-PROF-6).

## Tests to add (Vitest + MSW; one per route)
- `app/me/profile/__tests__/page.test.tsx`, `onboarding/profile/…`, `u/[slug]/…`, `bids/…`, `subscriptions/…`, `notifications/…`, `dashboard/…`, payment-methods + repost/rehire interactions.
- Each asserts: loading state, **auth redirect when no token**, data render, primary action calls the right endpoint with the right body, **error-envelope → Arabic message**, RTL copy present. (TESTING_STRATEGY §6.3)
- Components: extend the existing `NotificationsBell`, `ModeToggle`, `ReviewsSection`, new `FileUpload` (Part 03), `ProfileWizard`.

## Exit criteria
- [x] No referenced-but-missing pages remain (profile, wizard, public profile, bids purchase, subscriptions, notification center, payment methods).
- [x] Dashboard shows real numbers, mode-aware.
- [x] Every new route has a passing page test (loading/auth/action/error/RTL); FE coverage ≥ targets.
