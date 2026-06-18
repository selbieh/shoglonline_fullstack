"""Maintenance mode (FR-ADM-3). When `platform.maintenance_mode` is on, the public site + API
return 503 + Retry-After with an Arabic maintenance page, while the admin back-office and signed-in
staff stay reachable. The flag is read through the cached accessor (60s TTL) so toggling it from the
admin takes effect platform-wide within ≤60s (US-46) without a deploy."""
from django.http import HttpResponse, JsonResponse

from apps.core.services import get_setting

# Paths that always stay up: the admin back-office, assets, and the public-settings endpoint —
# the SPA reads the latter to learn it's in maintenance and render the page (so it can't be blocked).
EXEMPT_PREFIXES = ("/admin", "/static", "/media", "/api/v1/settings/public")
RETRY_AFTER_SECONDS = 300
DEFAULT_MESSAGE_AR = "الموقع تحت الصيانة حاليًا — نعود قريبًا بإذن الله. شكرًا لتفهّمك."


class MaintenanceModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._blocked(request):
            return self._maintenance_response(request)
        return self.get_response(request)

    def _blocked(self, request) -> bool:
        if not get_setting("platform.maintenance_mode", False):
            return False
        if request.path.startswith(EXEMPT_PREFIXES):
            return False  # /admin/*, static & media stay reachable
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated and user.is_staff:
            return False  # session-authenticated staff are never locked out
        return True

    def _maintenance_response(self, request):
        message = get_setting("platform.maintenance_message_ar", DEFAULT_MESSAGE_AR)
        if request.path.startswith("/api"):
            response = JsonResponse(
                {"code": "maintenance_mode", "message_ar": message}, status=503
            )
        else:
            response = HttpResponse(_maintenance_html(message), status=503,
                                    content_type="text/html; charset=utf-8")
        response["Retry-After"] = str(RETRY_AFTER_SECONDS)
        return response


def _maintenance_html(message: str) -> str:
    return (
        "<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>صيانة — شغل أونلاين</title>"
        "<style>body{font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:#F6F7FD;"
        "color:#23263F;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}"
        ".card{max-width:480px;text-align:center;padding:2.5rem}h1{color:#5155BE}p{line-height:1.9}</style>"
        "</head><body><div class='card'><h1>🔧 صيانة مجدولة</h1>"
        f"<p>{message}</p></div></body></html>"
    )


# Content-Security-Policy (SEC-6). default-src self; the admin (Unfold) needs inline styles/scripts +
# Google Fonts; images allow data:/https:. frame-ancestors 'none' complements X-Frame-Options DENY.
_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)
# Unfold's admin ships Alpine.js, which evaluates x-data/x-show expressions via the AsyncFunction
# constructor — CSP blocks that unless 'unsafe-eval' is present, leaving the login/dashboard stuck
# behind Alpine's modal blur overlay. Relax eval for the admin only; the public API/site keep _CSP.
_ADMIN_CSP = _CSP.replace(
    "script-src 'self' 'unsafe-inline';",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
)
_SECURITY_HEADERS = {
    "Content-Security-Policy": _CSP,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
}


class SecurityHeadersMiddleware:
    """Adds the security-header set (CSP, Referrer-Policy, Permissions-Policy, COOP) to every
    response (SEC-6). HSTS/SSL-redirect/secure-cookies live in production settings."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        for header, value in _SECURITY_HEADERS.items():
            response.setdefault(header, value)
        if request.path.startswith("/admin/"):
            response["Content-Security-Policy"] = _ADMIN_CSP  # Alpine needs 'unsafe-eval'
        return response
