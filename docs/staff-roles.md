# Staff roles & 2FA (FR-AUTH-8 / FR-ADM-8)

## Two-factor authentication
- All staff must use a **TOTP** device (django-otp) to reach the Unfold admin.
- Enforced by `apps/core/admin_otp.OTPRequiredAdminSite` (the admin site's `has_permission`
  additionally requires `request.user.is_verified()`), gated by the `ADMIN_OTP_REQUIRED` setting.
- `ADMIN_OTP_REQUIRED` is **on** in staging/production and **off** in dev/test (password-only) so
  the local admin and the test suite work without provisioning devices.
- Provision a device per staff member from the admin (TOTP devices) — a superuser adds the device,
  the staff member scans the provisioning URI in an authenticator app, then logs in with
  email + password + the 6-digit code.

## Role groups (least privilege)
Created/refreshed idempotently by `python manage.py setup_staff_roles`. No scoped group is granted
`delete`; destructive removal stays a superuser action and append-only logs (AuditLog) are never
deletable.

| Group | Scope | Models (actions) |
|---|---|---|
| **Super** | Full platform control | every permission |
| **Ops** | Marketplace moderation | jobs·proposals·invitations (view/change), services·buying-requests (view/change), categories·skills·bid-plans (view/add/change) |
| **Finance** | Money | wallets·transactions (view), withdrawals·invoices (view/change), affiliate rules (view/add/change), affiliate earnings (view) |
| **Support** | Users & engagement | users (view/change → freeze/activate), tickets (view/change), ticket types (view/add/change), conversations (view), notifications (view/add/change), ID verifications (view/change), worker profiles (view) |
| **Content** | CMS | landing sections·pages·FAQ (view/add/change) |

Assign a staff member to one or more groups in the admin (Users → user → groups). The group's
permissions gate which admin sections and actions they can use.
