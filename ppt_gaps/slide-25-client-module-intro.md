# Slide 25 — Client Profile Module (intro + cross-cutting rule)

- **Module:** Client / Employer Profile
- **PPT screen:** Title slide. Same red note: «صفحة البروفايل يجب ان تخلو من اي وسيلة تواصل خارجي»
  — no external contact methods on employer profiles either.
- **Status:** — (section marker; rule reuse)

## 1. What the slide proposes
Opens the Client/Employer module (slides 26–28) and reiterates the **no external contact**
rule (`slide-01`) for employer-facing surfaces (company profile, dashboard).

## 2. Current state in the codebase
- `EmployerProfile` model exists (company_name + rating + total_spent) but has **no API,
  serializer, or dedicated UI**. Employers today are just users with `active_mode=find_worker`.
- `frontend/app/dashboard/page.tsx` is the closest existing employer surface.

## 3. Gap
The employer module is barely modelled (no create flow, no profile API, thin dashboard).
The contact rule must apply to any employer free-text (company description, job text) too.

## 4. Plan
- Treat this as the umbrella for slides 26–28. Apply the slide-01 contact guard to employer
  free-text fields (company name/description, job descriptions if not already covered).
- No standalone code beyond ensuring the guard + module sequencing.

## 5. Acceptance criteria
- Employer-facing text fields reject external contact info; module slides 26–28 planned.

## Dependencies
Contact guard `slide-01`. Children: `slide-26`, `slide-27`, `slide-28`. `slide-29` is out of
scope per the deck.
