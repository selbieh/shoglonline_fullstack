from .base import *  # noqa: F403
from .base import env

DEBUG = True
ALLOWED_HOSTS = ["*"]
GOOGLE_AUTH_STUB = env.bool("GOOGLE_AUTH_STUB", default=True)  # dev login without a client id
PAYPAL_STUB = env.bool("PAYPAL_STUB", default=True)  # dev charge without PayPal credentials
CORS_ALLOW_ALL_ORIGINS = True

# Behind an HTTPS-terminating reverse proxy (the server proxies https://<domain> → the container's
# plain-HTTP port): trust the proxy's forwarded scheme so Django knows the request is secure. This
# gives correct https absolute URLs and lets the admin's CSRF/Referer checks pass. Harmless for
# pure-local dev — the header simply isn't present there, so requests stay http.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
