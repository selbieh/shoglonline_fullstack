# Slide 01 — Create Freelancer Profile Module (intro + cross-cutting rule)

- **Module:** Freelancer Profile
- **PPT screen:** Title slide. Red note (general): «صفحة البروفايل يجب ان تخلو من اي وسيلة تواصل خارجي» — the profile page must contain **no external contact method**.
- **Status:** ⚠️ partial (mostly satisfied; needs an audit + guardrail)

## 1. What the slide proposes
A platform rule that applies to **every** profile/public surface in this module:
freelancers must not be able to put WhatsApp numbers, phone numbers, personal emails,
or social links (LinkedIn/Instagram/etc.) anywhere a viewer could see them — bio, overview,
portfolio descriptions, certificate links, project links, intro video, service text.
All contact stays **on-platform** (chat / hire). This is the anti-disintermediation rule.

## 2. Current state in the codebase
- Public profile `frontend/app/freelancers/[id]/page.tsx` already shows **no** WhatsApp/social
  links and **no** raw email/phone (good — confirmed by exploration).
- However, free-text fields are rendered verbatim and **not sanitised**:
  - `WorkerProfile.overview`, `bio_title` (rendered `whitespace-pre-wrap`).
  - `PortfolioItem.description`, `PortfolioItem.url`, `cover_url`.
  - Skills/languages are controlled, low risk.
- Backend has no validator stripping phone/email/URLs from public-facing text.
- The old `design/screens/profile-public.html` historically had a contact area — must stay removed.

## 3. Gap
There is no enforcement preventing a freelancer from typing a phone number / email / external
link into bio, portfolio description, or (future) intro-video/service fields. The rule is a
convention, not a guardrail.

## 4. Plan
This slide is a **policy** that the other slides must honour. Implement once, reuse everywhere.

### Backend
1. Add a shared sanitiser `apps/core/contact_guard.py`:
   - `contains_contact_info(text) -> bool` and `strip_contact_info(text) -> str`.
   - Detect: e-mail regex, phone-like digit runs (≥8 digits, +country), `wa.me`, `t.me`,
     `instagram.com`, `linkedin.com`, `facebook.com`, `@handle`, bare `http(s)` links in
     fields that should not have links (bio/overview/cert name).
2. Apply as a serializer validator on writeable public-facing text:
   `WorkerProfileSerializer.overview/bio_title`, `PortfolioItemSerializer.description`,
   and the future cert/service/portfolio-detail serializers.
   - Reject on PATCH with `400 {code: "contact_not_allowed", field, message_ar}`.
3. Allow legitimately-needed URLs only in **structured** url fields (portfolio `url`,
   project link, verification link) — never in free text.

### Frontend
4. Mirror the check client-side for instant feedback (reuse regex via `frontend/lib/`),
   show an inline error: «لا يُسمح بإضافة وسيلة تواصل خارجية».
5. Add a one-line helper under bio/description fields stating the rule.

## 5. Acceptance criteria
- Submitting a bio/portfolio description containing a phone/email/social link is rejected
  on both client and server with an Arabic message.
- Public profile renders no external contact anywhere (verified by a test fixture profile
  whose stored fields contain such strings — they must not appear).

## Dependencies
Feeds: slides 03, 05, 06, 11, 12, 18, 20, 21, 22, 23, 25. Implement the guard before/with
the wizard work so new fields inherit it.
