# Maintenance Mode Runbook (Part 12 step 3 · Part 04 middleware)

Maintenance mode serves the public site an Arabic **503 + `Retry-After`** while keeping the admin and
staff reachable, so operators can work during an incident or a risky migration.

## How it works
- Flag: `platform.maintenance_mode` (a public `core.GlobalSetting`).
- Enforced by `apps.core.middleware.MaintenanceModeMiddleware`.
- **Exempt** (stay reachable when ON): `/admin*`, authenticated staff, and `GET /api/v1/settings/public`.
- Cache: settings are cached for 60s, so a flip takes effect platform-wide **within ~60 seconds**.
- The frontend public-site 503 for crawlers is terminated at the proxy/CDN (deferred from Part 08);
  the backend API + admin already 503 via this middleware.

## Flip it
```bash
python manage.py maintenance on      # public → 503; admin/staff unaffected
python manage.py maintenance status  # ON | OFF
python manage.py maintenance off
```
Or via the admin Global Settings screen. Both paths write through `core.services.set_setting`, so the
change is **audited** (`SettingChangeLog`) and the cache is busted immediately.

## Drill (rehearse before go-live)
1. `python manage.py maintenance on`.
2. From an anonymous client: `curl -i https://<host>/api/v1/jobs` → **503** with `Retry-After` and the
   Arabic maintenance message.
3. Confirm an admin can still load `/admin/` and that `GET /api/v1/settings/public` returns 200.
4. `python manage.py maintenance off`; re-check `curl -i .../api/v1/jobs` → **200** within ~60s.
5. Record the observed flip-on and flip-off latencies (expect ≤ 60s).
