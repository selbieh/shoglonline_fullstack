# QA Issue Register — Forms, Flows & UI

Source: multi-agent discovery sweep (8 parallel finders → dedup → adversarial verification),
2026-06-27. 49 candidates → **47 confirmed** real issues (2 refuted). After merging duplicate
reports of the same root cause, **41 distinct issues** are tracked below.

Severity: **P0** = data loss / money / broken core flow / security · **P1** = broken validation or
error handling a user will hit · **P2** = polish / edge / a11y. No P0s were found.

Status legend: ☐ open · ☑ fixed (+ regression test linked).

## Resolution status — ALL 41 FIXED ✅ (2026-06-27)

Fixed across two multi-agent waves, each fix paired with a regression test. Verification:
- **Backend:** `654 passed`, coverage **91.54%** (≥90% gate) via `make test` (Docker).
- **Frontend typecheck:** `tsc --noEmit` clean.
- **Frontend tests:** full Vitest suite **128 passed** (the only 2 failures are a *pre-existing*
  dashboard currency-format test, unrelated to this work — it fails identically on `main` with all
  these changes reverted; an `Intl`/ICU locale artifact that passes in CI).

Shared-infra fixes made during verification (benefit the whole suite):
- `frontend/lib/errors.ts`: added `isAuthError(e)` (HTTP-401 guard) — used by the BUG-05 family.
- `frontend/test/msw/handlers/common.ts`: default `/auth/me` + `/me/conversations` handlers so
  `DashboardShell`-wrapped page tests don't each stub them.
- `frontend/vitest.setup.ts`: stub `URL.createObjectURL/revokeObjectURL` (jsdom lacks them; image
  uploads need them).
- Several page tests had **non-idiomatic `useRouter` mocks returning a fresh object per render**,
  which—combined with router-dependent load effects—caused infinite re-fetch loops (the "OOM"). Made
  the mocks return a stable router object. (Production `useRouter` is memoized, so no app bug.)
- `frontend/components/Field.tsx` (P2-32) now injects `aria-invalid`/`aria-describedby`/`aria-required`;
  a few **exact-string** `getByLabelText` test queries were switched to the repo's regex convention.

---

## P1 — broken validation / error handling / flow (6)

### P1-01 — Onboarding mode select strands the user on failure ☑
`frontend/app/onboarding/mode/page.tsx:14-20`
`choose()` does `setBusy(true)` then `await api("/auth/me/mode", …)` with **no try/catch/finally**.
On any non-401 failure (403/500/network) the promise rejects, `setBusy(false)` never runs, both
cards stay permanently disabled, no message shows, and `router.push` never fires. **Fix:** wrap in
try/catch/finally — reset busy in finally, surface `message_ar` in catch.

### P1-02 — Wizard completeness % ≠ backend publish gate ☑
`frontend/app/onboarding/profile/page.tsx:237-238` vs `backend/apps/profiles/models.py:95-105` + `…/api/views.py:58-59`
Backend `completeness_pct` averages **8** checks (incl. educations, employments, languages); the
wizard's client `pct` averages a different **7** and the wizard has **no UI** for educations/
employments. A user can see "ملفك جاهز بنسبة 100٪" then get `400 profile_incomplete` on publish.
**Fix:** align the gate's `completeness_pct` to the fields the wizard actually collects (or add the
missing steps + require a language). Recommended: change the formula to match wizard fields.

### P1-03 — Inline service edit swallows field errors into one banner ☑
`frontend/app/me/services/[id]/page.tsx:87-112,203`
`saveEdit()` catch uses `apiError(e).message_ar` → generic "تحقّق من الحقول المدخلة" banner; the
backend's field-keyed `fields` map (description min 30, delivery_days ≥ 1) is discarded, no input
highlighted. The create wizard does this right via `applyApiError`. **Fix:** adopt `useFieldErrors`/
`applyApiError` and render per-input errors.

### P1-04 — Inline portfolio quick-add bypasses ownership gate (not enforced server-side) ☑
`frontend/app/me/profile/page.tsx:658-669` + `backend/apps/profiles/api/serializers.py` (PortfolioItemSerializer)
`/me/portfolio/new` hard-blocks on `ownership_confirmed`, but the inline `PortfolioSection.submit()`
posts without it, and the backend serializer treats `ownership_confirmed` as an ordinary writable
field (default `False`, no validation). Works get created with `ownership_confirmed=false` and no
prompt. **Fix (primary):** enforce server-side — require `ownership_confirmed is True` on create in
the serializer; (secondary) add the confirmation to the inline form.

### P1-05 — Add-payout-method collapses field errors into a generic banner ☑
`frontend/app/settings/payouts/page.tsx:95-99`
`add()` catch uses `apiError(e).message_ar`; field-keyed errors (bad IBAN / PayPal email) are
discarded even though the form renders keyed inputs. This page is the lone outlier (7 other forms
use `apiFieldErrors`). **Fix:** map `fields` onto each input via `useFieldErrors`/`apiFieldErrors`.

### P1-06 — BUG-05: profile editor bounces authenticated user to /signin on ANY load failure ☑
`frontend/app/me/profile/page.tsx:114-150`
`Promise.all([/auth/me, /me/profile, /skills, /me/id-verification, /categories]).catch(() => router.replace(signin))`.
A transient 500/network error on a **non-auth** endpoint (skills/categories/id-verification) rejects
the whole batch and ejects the logged-in user, discarding unsaved edits. (Reported 3× by finders;
session survives since tokens aren't cleared on non-401, hence the eject is recoverable — but still a
P1 UX/data-loss risk.) **Fix:** `Promise.allSettled`; only redirect on a genuine 401 of the
auth-critical pair; default catalog/IDV to empty/fallback. Same anti-pattern (lower blast radius) in
P2-29/P2-30/P2-31.

---

## P2 — error round-trip / field mapping (5)

- **P2-01** — `profile_incomplete` publish rejection shows a banner but no step-jump/missing-items list. `frontend/app/onboarding/profile/page.tsx:304-314` (backend returns no `fields`). Fix: have publish return a missing-items/`fields` list, or map the code to the earliest incomplete step.
- **P2-02** — Add-on validation errors jump to step 2 but highlight no input (no `error` prop on add-on Fields). `frontend/app/me/services/new/page.tsx:285-303`. Fix: pass `error={errors.addons}` to the add-on price Field.
- **P2-03** — `screening_required` (domain error with `missing_questions` pks) falls back to banner instead of marking the question inputs. `frontend/app/jobs/[slug]/ProposalForm.tsx:106-114` + `backend/apps/jobs/services.py:144-146`. Fix: emit `missing_questions` under `fields` (`q_<pk>`) or map them client-side.
- **P2-04** — `budget_min>budget_max` keyed on **different inputs** client (budget_max) vs backend (budget_min). `frontend/app/jobs/new/page.tsx:96-100` vs `backend/apps/jobs/api/serializers.py:72-73`. Fix: key both to the same field (change backend key to `budget_max`).
- **P2-05** — Non-numeric `new_budget` in contract update degrades to "empty update" instead of a field error. `backend/apps/contracts/api/views.py:130-134`. Fix: if raw is truthy but unparseable, raise `{"new_budget": "أدخل رقمًا صحيحًا"}`.

## P2 — validation gaps (10)

- **P2-06** — Inline service edit lacks client rules (description ≥ 30, delivery_days ≥ 1, base_price > 0); only guards empty title. `frontend/app/me/services/[id]/page.tsx:87-104,205`.
- **P2-07** — Price inputs allow multiple decimal points via `replace(/[^\d.]/g)`. `frontend/app/me/services/new/page.tsx:226,293`. Fix: single-decimal mask; add-on price has no client rule at all.
- **P2-08** — Proposal `delivery_days` has no client max (backend caps 365); budget allows >2 decimals. `frontend/app/jobs/[slug]/ProposalForm.tsx:75-87`.
- **P2-09** — Proposal budget never validated against the job's `budget_min/budget_max` range (client **or** server) despite the range being shown as a hint. `frontend/app/jobs/[slug]/ProposalForm.tsx:75-87` + `backend/apps/jobs/services.py:128-186`. Fix: add range check both sides. *(Borderline P1 — purely cosmetic range today.)*
- **P2-10** — Email-change request only checks truthiness, not format/whitespace; input isn't in a `<form>` so native validation never runs. `frontend/app/settings/page.tsx:174-178`.
- **P2-11** — Payout details trimmed for the enable-check but submitted untrimmed. `frontend/app/settings/payouts/page.tsx:185`.
- **P2-12** — Hourly-rate is free-text with no numeric/min validation (inconsistent with sibling type=number fields). `frontend/app/me/profile/page.tsx:367-369`.
- **P2-13** — `years_experience`/`weekly_hours`/`hourly_rate` call `Number()` without Arabic-digit normalization (repo has `toAsciiDigits`/`digitsOnly`). `frontend/app/onboarding/profile/page.tsx:567-569,790,807`.
- **P2-14** — Support ticket create guards on trimmed values but sends untrimmed title/message; no field-error mapping, no maxlength. `frontend/app/support/page.tsx:70-90`.
- **P2-15** — Contract new-budget input is plain text (no `type=number`/`inputMode`/min); negatives/strings reach the server. `frontend/app/contracts/[id]/page.tsx:299-300`.
- **P2-16** — Dead unreachable negative-budget branch in `JobCreateSerializer.validate` (after `min_value=0`). `backend/apps/jobs/api/serializers.py:58-71`. Fix: drop dead code.

## P2 — state / resilience (6)

- **P2-17** — `saveProfile` fires two sequential PATCHes (`/auth/me` then `/me/profile`) with no rollback; second failure leaves name/avatar saved while UI implies nothing saved. `frontend/app/me/profile/page.tsx:158-176`.
- **P2-18** — Wizard `saveProfile` PATCHes `/auth/me` (avatar) **before** `/me/profile`; an avatar failure aborts the whole step save and can silently lose entered data. `frontend/app/onboarding/profile/page.tsx:243-266`.
- **P2-19** — Chat composer: during an in-flight file upload the attachment/mic buttons aren't gated on `busy`, allowing a concurrent second send. `frontend/components/chat/MessageComposer.tsx:88-115`.
- **P2-29** — Contracts list redirects to /signin on any `/me/contracts` failure (incl. transient/filter). `frontend/app/contracts/page.tsx:49-51`. (BUG-05 family.)
- **P2-30** — Settings page `Promise.all` of 3 endpoints redirects to /signin on any single failure. `frontend/app/settings/page.tsx:47-58`. (BUG-05 family.)
- **P2-31** — Contract detail: any `load()` failure (incl. transient/network) silently redirects to /contracts, losing context/entered notes. `frontend/app/contracts/[id]/page.tsx:73-78`. (BUG-05 family.)

## P2 — flow integrity (4)

- **P2-20** — Worker can create multiple OPEN submissions while contract is Delivered; only the first is decidable, the rest orphan forever (no guard, no unique constraint). `backend/apps/contracts/services.py:210-227` + `frontend/app/contracts/[id]/page.tsx:130-132`.
- **P2-21** — Editing phone/country after OTP sent doesn't reset `otpSent`/`code`; stale code box implies the changed number is being verified (data layer is safe — backend binds phone server-side). `frontend/app/onboarding/profile/page.tsx:840-860` + `…/employer/page.tsx:180-197`.
- **P2-22** — Chat composer: Enter always sends; no IME composition guard (premature send mid Arabic/CJK composition). `frontend/components/chat/MessageComposer.tsx:120`.
- **P2-23** — Rejected service shows the "مرفوضة" chip but never displays `reject_reason` (serializer omits it; every other reject path shows it). `frontend/app/me/services/[id]/page.tsx` + `backend/apps/gigs/api/serializers.py`.

## P2 — uploads (2)

- **P2-24** — `FileUpload` enforces size but never validates MIME/type client-side; `accept` is bypassed on drag-drop; error `<p>` has no `role=alert`. `frontend/components/FileUpload.tsx:44-63,105`.
- **P2-25** — Chat attachment picker has no client MIME/size guard; generic file input has empty `accept`. `frontend/components/chat/MessageComposer.tsx:56-66,135-137`.

## P2 — UI / RTL (3)

- **P2-26** — Review row always renders "أيام" (shows "1 أيام"); repo has `pluralizeDays`. `frontend/app/me/services/new/page.tsx:315`.
- **P2-27** — Proposal delivery-days affix uses physical `pl-12`/`left-4` instead of logical `pe-12`/`end-*` in RTL (jobs/new does it right). `frontend/app/jobs/[slug]/ProposalForm.tsx:224-226`.
- **P2-28** — BuyBox add-on checkbox uses physical `ml-2` instead of logical `me-2`. `frontend/app/services/[slug]/BuyBox.tsx:110`.

## P2 — accessibility (5)

- **P2-32** — `Field` `required` renders only an `aria-hidden` asterisk (no `aria-required`); error span isn't tied to the input via `aria-invalid`/`aria-describedby`. `frontend/components/Field.tsx:22-44`. High leverage — affects every form.
- **P2-33** — Delete-blocker list signals via warn color only; no `role=alert`/`aria-live`. `frontend/app/settings/page.tsx:237-244`.
- **P2-34** — Email panel nests a button + multiple inputs inside one `<label>` (invalid markup, ambiguous association). `frontend/app/settings/page.tsx:161-198`.
- **P2-35** — No focus management to the first invalid field / error banner on submit failure; banner `<p>` lacks `role=alert`/tabindex. `frontend/app/jobs/new/page.tsx:108-135` (pattern across forms).
- **P2-36** — FileUpload error message is color/text only with no live region (folded into P2-24).

---

## Notes
- Three finder reports of BUG-05 were merged into **P1-06**; the same redirect-on-any-error
  anti-pattern recurs in **P2-29/30/31** (contracts list, settings, contract detail) — a shared fix
  helper (`isAuthError(err)` / `Promise.allSettled`) should cover all four.
- Two RTL reports of the proposal affix merged into **P2-27**; two `Field.tsx` a11y reports merged
  into **P2-32**; two `FileUpload` reports merged into **P2-24**.
- 2 candidates were refuted by verification and are intentionally excluded.
