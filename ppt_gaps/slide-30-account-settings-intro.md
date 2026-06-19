# Slide 30 — إعدادات الحساب (unified settings shell)

- **Module:** Account Settings (shared by freelancer + employer)
- **PPT screen:** Title slide: «إعدادات الحساب — موحد بين المستقل وصاحب العمل».
- **Status:** ⚠️ partial — a flat settings page exists; no sidebar shell.

## 1. What the slide proposes
A single, **unified** settings area for both roles, with a left sidebar of sections (seen
across slides 31–43): معلومات الحساب · الأمان · الرصيد · استلام الأرباح · المدفوعات/وسائل
الدفع · المفضلة. The same shell serves freelancer and employer accounts.

## 2. Current state in the codebase
- `frontend/app/settings/page.tsx` — a **flat** page: visibility toggle, notification prefs,
  delete account. **No sidebar**, no sub-routes.
- Related surfaces live elsewhere: wallet (`app/wallet`), payment methods
  (`components/PaymentMethods` inside wallet), favorites (`app/me/favorites`).
- Account names/email are edited via `me/profile` / `auth/me`, not a settings "account info".

## 3. Gap
There is no unified settings shell with a sidebar; the settings-related features are
scattered across `settings`, `wallet`, `me/favorites`, and `me/profile`.

## 4. Plan
This slide is the **shell** that slides 31–43 plug into.

### Frontend
1. Create a settings layout `frontend/app/settings/layout.tsx` with the RTL sidebar:
   معلومات الحساب (`/settings`), الأمان (`/settings/security`), الرصيد (`/settings/balance`),
   استلام الأرباح (`/settings/payouts`), وسائل الدفع (`/settings/payment-methods`),
   المفضلة (`/settings/favorites`).
2. Move/forward existing pages into this shell:
   - balance ← `app/wallet` (`slide-32`), payment-methods ← `PaymentMethods` (`slide-35/36`),
     favorites ← `me/favorites` (`slide-43`).
   - Keep redirects from old routes so existing links don't break.
3. Same shell for both roles; hide role-irrelevant items if needed (e.g. استلام الأرباح is
   primarily for earners, but the deck unifies it).

### Backend
4. None specific; reuse existing endpoints.

## 5. Acceptance criteria
- `/settings/*` renders a consistent sidebar shell; all sub-pages (31–43) live under it for
  both freelancer and employer.

## Dependencies
Parent of slides 31–43. Consolidates `app/wallet`, `PaymentMethods`, `me/favorites`.
