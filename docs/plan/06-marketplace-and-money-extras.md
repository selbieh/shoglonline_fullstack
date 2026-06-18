# PART 06 — Marketplace & Money Extras

**Goal:** the remaining marketplace breadth and money features the SRS lists as Must.
**Depends on:** Parts 01–02 (03 for any file fields).
**SRS refs:** FR-JOB-11/12, FR-PAY-4, §4.15, FR-AFF-1/2/3, FR-BID-2, FR-PROF-4. **Reference:** GAP Phase 13.
**Effort:** M/L

## Steps

### Jobs re-engagement — FR-JOB-11 / FR-JOB-12
1. [x] **Repost** a previous job: public | privately to same worker | to a specific worker, editing description/files/min-budget before reposting (reuse the existing unused `source_job` field).
2. [x] **Rehire** a worker: post a private job pre-filled from the previous engagement (editable), with a request-to-propose to that worker (no bid charged — invited flow, BR-7).

### Commission ranges — FR-PAY-6 / §4.15
3. [x] Replace the flat `payments.commission_pct` setting with admin-managed **commission types + ranges** (range → rate), worker vs employer. Selection at contract creation; **frozen on the contract** (keep BR-24 rounding so `hold = worker_earning + commission` exactly).

### Payment methods — FR-PAY-4
4. [x] `PaymentMethod` model (type, provider, masked details, gateway token). Add/edit/delete saved methods; **PANs never stored** (tokenize at gateway, PCI SAQ-A). Reuse on charge.

### Affiliate completeness — FR-AFF-1/2/3 / BR-18
5. [x] **Click tracking** + **cookie attribution** endpoint on referral-link visit (configurable window) — today attribution is an explicit `slug` POST only.
6. [x] **User-editable unique slug** (validated) + social share (FB/X/WhatsApp). Stats show clicks/registrations/transactions/earnings.

### Smaller gaps
7. [x] **FR-BID-2** bid usage-history endpoint (current month / this year / all time / custom period + summary).
8. [x] **FR-PROF-4** public SEO worker-profile endpoint + page (cover, picture, city, total earned, rating/feedback, bio, portfolio, skills, level, languages, reviews) — used by Part 08 SEO/JSON-LD `Person`.

## Tests to add
- `tests/integration/test_repost_rehire.py` — ✅ public/private/specific repost; rehire pre-fill + invited (no bid) ; ⛔ rehire stranger as if prior party.
- `tests/unit/test_commission_ranges.py` — range selection per amount; frozen on contract; BR-24 invariant holds across ranges.
- `tests/integration/test_payment_methods.py` — add/mask/delete; 🛡 no PAN persisted/logged.
- `tests/integration/test_affiliate_clicks.py` — click→cookie→registration→transaction attribution within window (**AC-10**); 🔐 self-referral void (BR-21); slug uniqueness.
- `tests/integration/test_bids_history.py` + `tests/integration/test_public_profile.py`.

## Exit criteria (maps **AC-3 / AC-10**)
- [x] Repost + rehire flows work and respect the invited-no-bid rule.
- [x] Commission ranges drive + freeze on the contract; ledger invariant unchanged.
- [x] Saved payment methods tokenized (no PANs); affiliate click→registration→transaction attribution within the cookie window; custom slug + share live.
- [x] Bid history + public worker profile endpoints shipped (profile feeds Part 08 SEO).
