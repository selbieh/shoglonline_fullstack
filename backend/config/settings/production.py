from .base import *  # noqa: F403
from .base import env

DEBUG = False
GOOGLE_AUTH_STUB = False  # hard-off in production (SEC)

SECRET_KEY = env("DJANGO_SECRET_KEY")  # required, no default
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

# Never allow all origins in production — restrict to CORS_ALLOWED_ORIGINS (env).
CORS_ALLOW_ALL_ORIGINS = env.bool("CORS_ALLOW_ALL_ORIGINS", default=False)

# Security headers (SEC-6)
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# whitenoise for static files. Mutate only the staticfiles backend so the default (media)
# backend chosen in base.py — S3 when USE_S3=1, else the local filesystem — is preserved.
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
}
