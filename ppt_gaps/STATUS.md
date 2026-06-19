# ppt_gaps — Build status (current)

Per-slide plans live in `slide-*.md`; this file is the **authoritative current state** after
implementation. Legend: ✅ done · ⏸ deferred (backend-gated, noted) · 🚫 out of scope.

> Visual authority = `Sho8l online (Copy).pdf`. Functional authority = these slides (wins on conflict).

## Per-slide
| Slide | Status | Notes |
|------|--------|-------|
| 00 design system | ✅ | tokens→PDF palette; export logo/illustration/rating-chips; rainbow palette tamed |
| 01 no-external-contact rule | ✅ honored | profiles render no contact; input **sanitizer deferred** |
| 02 personal data | ✅ | onboarding wizard step 1 |
| 03 work & skills | ✅ | job title/field/specialization/years (in-wizard skill *picker* deferred) |
| 04 skill levels (4) | ✅ | `expert` added |
| 05 / 23 portfolio fields + add | ✅ | enriched PortfolioItem; `me/portfolio/new` (image *upload* via URL only) |
| 06 certificates | ✅ | model + `/me/certificates` (cert UI in profile editor deferred) |
| 07 pricing & availability | ✅ | rate(USD)/availability/weekly hours/notes |
| 08 verification | ✅ | email chip + phone OTP (**flag-gated, off**); ID front/back/selfie deferred |
| 09 review & publish | ✅ | review step + `/me/profile/publish` (≥70%) |
| 10 stepper | ✅ | `WizardStepper` |
| 11 / 12 profile self / others | ✅ | 2-col `freelancers/[id]` + `ProfileActions`; 18 services grid |
| 13 / 14 tasks (مهامي) | ✅ | StatusTabs + RowActionMenu on `contracts` |
| 15 / 16 proposals (عروضي) | ✅ | counts + menu; edit-offer (16) deferred |
| 17 services list (خدماتي) | ✅ | tabs + counts + actions |
| 18 services public grid | ✅ | on profile |
| 19 add service | ✅ | `me/services/new` 4-step (cover/gallery upload deferred) |
| 20 service owner detail | ✅ | `me/services/[id]` analytics (views/orders/conversion) |
| 21 service buyer detail | ✅ | `services/[slug]` 2-col |
| 22 / 24 portfolio detail / manage | ✅ | public `freelancers/[id]/portfolio/[itemId]`; `me/portfolio/[id]` edit (view counters deferred) |
| 25 client module intro | ✅ rule | |
| 26 / 27 employer create + verify | ✅ | EmployerProfile API + `onboarding/employer` |
| 28 employer dashboard | ✅ | KPIs + verification meter + open-tasks table |
| 29 employer others-view | 🚫 | not in platform |
| 30 settings shell | ✅ | `settings/layout` |
| 31 account info | ✅ | names/email/prefs/visibility/delete (email-change + deactivate = notes) |
| 32 balance | ✅ | 4 cards on `/wallet` (statement filters deferred) |
| 33 charge | ⏸ | stays PayPal; quick-amounts/coupon/fee deferred |
| 34 / 35 / 36 payment cards | 🚫 | **dropped per product** (no saved cards) |
| 37 receipt | ⏸ | needs Transaction reference fields |
| 38–42 payouts | ✅ | `settings/payouts` (PayPal/bank/e-wallet/Instapay; bank-card rail dropped) |
| 43 favorites | ✅ | 5 tabs (services live; jobs/freelancers/portfolio = polymorphic backend deferred) |

## Remediation round (2026-06-19) — gaps closed
Reachability (portfolio add/edit + invoices linked) · crash hardening (contracts/[id], invoices) ·
**all forms unified to `.field`** · `me/profile` editor + onboarding wizard field-complete (display_name,
category/specialization, availability, years, weekly_hours, client_notes, intro_video, avatar, certificates,
languages) · **contact guard** (server validators on profile/portfolio/service/job text + client hint) ·
**transaction receipts** (derived `TRX-` ref + printable modal) · **email-change** flow (token, settings UI) ·
**polymorphic favorites** (jobs/freelancers/portfolio + heart toggles + 4 tabs) · **ID capture**
(front/back/selfie + doc_type + consent in the wizard) · **uploads** for portfolio + service cover.
New migrations: **gigs 0006 (Favorite)**, **profiles 0012 (IDVerification doc_type+consent)**.

## Migrations (hand-authored; apply cleanly)
`profiles 0006–0012` · `payments 0004` · `gigs 0004, 0005, 0006`. Run:
```
docker compose exec backend python manage.py makemigrations --check accounts profiles payments gigs jobs contracts
docker compose exec backend python manage.py migrate && docker compose exec backend pytest
npm run build && npx vitest run          # frontend (onboarding + settings tests were rewritten)
```
Phone OTP only appears when an operator sets `profiles.phone_verification = true`.

## Deferred (remaining, optional)
in-wizard skill picker (skills still added in the profile editor) · multi-image *gallery* for
portfolio/service (single cover upload now works; galleries would need a service gallery model) ·
portfolio-item image change on the EDIT page (`MyPortfolioItemView.update` pops attachment_ids — add
`perform_update` to link) · edit-offer PATCH (16) · charge coupon + 2.5% fee (33) · real start-chat/report
(currently link to /messages,/support) · public serving of uploaded avatars (Google avatars already public).
