"""
ShoghlOnline — base settings (SRS v1.1).
12-factor: everything configurable via environment (NFR-MNT-1).
"""
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="insecure-dev-key-change-me")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# ---------------------------------------------------------------- apps
DJANGO_APPS = [
    "unfold",  # must come before django.contrib.admin (FR-ADM-1)
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]
LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.profiles",
    "apps.catalog",
    "apps.jobs",
    "apps.bids",
    "apps.subscriptions",
    "apps.payments",
    "apps.contracts",
    "apps.notifications",
    "apps.chat",
    "apps.reviews",
    "apps.tickets",
    "apps.gigs",
    "apps.invoices",
    "apps.affiliate",
    "apps.cms",
    "apps.attachments",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.core.middleware.MaintenanceModeMiddleware",  # FR-ADM-3: 503 + Arabic page when on
    "apps.core.middleware.SecurityHeadersMiddleware",  # SEC-6: CSP + security headers on every response
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],  # project template overrides (admin dashboard)
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------- db / cache
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://shoghl:shoghl@db:5432/shoghl"),
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHES = {
    "default": env.cache("CACHE_URL", default="locmemcache://"),
}

# ---------------------------------------------------------------- auth
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]

# Google SSO (FR-AUTH-1..3): the ONLY end-user auth method.
GOOGLE_OAUTH_CLIENT_ID = env("GOOGLE_OAUTH_CLIENT_ID", default="")
# Local-dev escape hatch: accept "stub:<email>" id_tokens. NEVER enable in production.
GOOGLE_AUTH_STUB = env.bool("GOOGLE_AUTH_STUB", default=False)

# Real-time + push adapters — stub-by-default in dev (no external creds needed)
FIRESTORE_STUB = env.bool("FIRESTORE_STUB", default=True)  # chat mirror (SRS §10.4)
FCM_STUB = env.bool("FCM_STUB", default=True)              # push notifications (FR-NOT-2)

# Firebase (chat data + real-time connections live in Firestore; the backend is the control
# plane — it mints per-user custom tokens and owns conversation docs/status via the Admin SDK).
FIREBASE_PROJECT_ID = env("FIREBASE_PROJECT_ID", default="")
# Service-account creds: a path to the JSON file OR the JSON content inline. Never committed.
FIREBASE_CREDENTIALS = env("FIREBASE_CREDENTIALS", default="config/firebase-credentials.json")
# Exposed to the web client (public by design) so the Firebase JS SDK can initialize.
FIREBASE_WEB_API_KEY = env("FIREBASE_WEB_API_KEY", default="")
# Shared secret the Firestore→Postgres sync (Cloud Function) presents on /chat/sync.
CHAT_SYNC_SECRET = env("CHAT_SYNC_SECRET", default="")

# PayPal — the only payment gateway (product decision, June 2026)
PAYPAL_STUB = env.bool("PAYPAL_STUB", default=False)
PAYPAL_CLIENT_ID = env("PAYPAL_CLIENT_ID", default="")
PAYPAL_SECRET = env("PAYPAL_SECRET", default="")
PAYPAL_BASE_URL = env("PAYPAL_BASE_URL", default="https://api-m.sandbox.paypal.com")

# ---------------------------------------------------------------- DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.api.pagination.StandardLimitOffsetPagination",
    "PAGE_SIZE": 20,  # = default_limit on the pagination class
    "EXCEPTION_HANDLER": "apps.core.api.exception_handler.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        # rate-limit matrix (SEC-5/§16): per-surface caps beyond the blanket anon/user limits
        "anon": "60/min",
        "user": "240/min",
        "auth": "10/min",      # google token exchange
        "chat_send": "30/min",  # FR-CHAT-10: cap message/report flooding per user
        "uploads": "60/min",    # attachment uploads
        "payments": "20/min",   # wallet charge + withdrawal requests (money-moving)
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),  # SEC-1
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ShoghlOnline API",
    "DESCRIPTION": "Arabic job & services marketplace — API contract (SRS v1.1 §11)",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------------------------------------------------------------- cors / security
# Allow all origins by default (dev convenience). Production overrides this to False
# and restricts to CORS_ALLOWED_ORIGINS. The API is JWT/Bearer-based (no cookies),
# so credentials are NOT sent cross-origin — a wildcard "*" is safe here.
CORS_ALLOW_ALL_ORIGINS = env.bool("CORS_ALLOW_ALL_ORIGINS", default=True)
CORS_ALLOW_CREDENTIALS = False
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000"])

# Public base URL of the SPA — used to build absolute links inside emails, notifications and
# referral links. MUST be set in production (env-driven) or those links point at localhost.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000").rstrip("/")

# ---------------------------------------------------------------- i18n (NFR-LOC)
# Django's active language drives the Unfold/Django admin + DRF built-in strings.
# The public site is Next.js (Arabic, separate) and the API's domain messages are
# explicit `message_ar` payloads — both independent of this setting — so we keep the
# back-office (admin) in English/LTR while the product stays Arabic for end users.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# File storage (Part 03). Local filesystem by default (dev/test); production sets USE_S3=1 with
# bucket creds to switch the default backend to an S3-compatible store (django-storages). Private
# files are served via the scoped /uploads/<id> endpoint, never by guessing the MEDIA_URL path.
if env.bool("USE_S3", default=False):
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="")  # set for MinIO; blank for AWS S3
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="")
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True  # signed, expiring URLs — private by default

# ---------------------------------------------------------------- celery
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://redis:6379/0")
# NFR-REL-3: jobs are idempotent + survive worker death. acks_late means a task is acked only after
# it finishes, so a worker that dies mid-run redelivers the job; reject_on_worker_lost lets that
# redelivery happen even on a hard crash. The sweepers are written to be idempotent (terminal-state
# flags + row locks), so a redelivery re-runs safely.
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # fair dispatch — a long sweep can't hog a prefetched backlog
CELERY_TASK_DEFAULT_RETRY_DELAY = 30  # seconds between automatic retries
CELERY_TASK_MAX_RETRIES = 5
CELERY_RESULT_EXPIRES = 60 * 60 * 24  # bound the result backend's growth
# Redis broker: a task unacked within this window (acks_late) is redelivered. Must exceed the longest
# task runtime so a slow-but-alive task isn't double-dispatched.
CELERY_BROKER_TRANSPORT_OPTIONS = {"visibility_timeout": 60 * 60}
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True  # ride out a broker not-yet-up at boot
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    "expire-jobs-hourly": {  # FR-JOB-17
        "task": "apps.jobs.tasks.expire_jobs",
        "schedule": 60 * 60,
    },
    "reconcile-deposits": {  # FR-PAY-2: 15-min SLA for lost webhooks
        "task": "apps.payments.tasks.reconcile_pending_deposits",
        "schedule": 5 * 60,
    },
    "monitor-ledger-invariants": {  # AC-13: page on any ledger drift
        "task": "apps.payments.tasks.monitor_ledger_invariants",
        "schedule": 15 * 60,
    },
    "cancel-unfunded-contracts": {  # BR-6a: funding-timeout sweeper
        "task": "apps.contracts.tasks.cancel_unfunded_contracts",
        "schedule": 15 * 60,
    },
    "release-due-warranties": {  # BR-10: warranty-end fund release
        "task": "apps.contracts.tasks.release_due_warranties",
        "schedule": 60 * 60,
    },
    "notify-overdue-contracts": {  # FR-TASK-9
        "task": "apps.contracts.tasks.notify_overdue_contracts",
        "schedule": 6 * 60 * 60,
    },
    "unread-chat-emails": {  # FR-CHAT-5 / AC-6: one email per message unread past the delay
        "task": "apps.chat.tasks.send_unread_chat_emails",
        "schedule": 60,
    },
    "lock-idle-conversations": {  # FR-CHAT-7
        "task": "apps.chat.tasks.lock_idle_conversations",
        "schedule": 6 * 60 * 60,
    },
    "auto-solve-tickets": {  # FR-TKT auto-solve
        "task": "apps.tickets.tasks.auto_solve_tickets",
        "schedule": 6 * 60 * 60,
    },
    "auto-close-tickets": {  # FR-TKT auto-close
        "task": "apps.tickets.tasks.auto_close_tickets",
        "schedule": 6 * 60 * 60,
    },
    "dispatch-scheduled-notifications": {  # FR-NOT-4: send due admin broadcasts
        "task": "apps.notifications.tasks.dispatch_scheduled_notifications",
        "schedule": 60,
    },
    "send-offline-reminders": {  # BR-16 / FR-PROF-5: nudge long-offline workers
        "task": "apps.profiles.tasks.send_offline_reminders",
        "schedule": 6 * 60 * 60,
    },
    "sweep-orphan-attachments": {  # Part 03: reclaim uploads never linked to a host
        "task": "apps.attachments.tasks.sweep_orphan_attachments",
        "schedule": 6 * 60 * 60,
    },
}

# ---------------------------------------------------------------- email
EMAIL_BACKEND = env(
    "EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="شغل أونلاين <no-reply@shoghlonline.com>")

# ---------------------------------------------------------------- unfold admin
from config.unfold import UNFOLD  # noqa: E402,F401  (brand theme + sidebar, FR-ADM-1)

# ---------------------------------------------------------------- logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    # SEC §16: scrub secrets/PANs/tokens from every record before it's written.
    "filters": {"redact": {"()": "apps.core.logfilters.RedactingFilter"}},
    "formatters": {
        "plain": {"format": "%(levelname)s %(name)s %(message)s"},
        "json": {"()": "apps.core.logfilters.JsonFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "filters": ["redact"],
            # structured JSON in prod (DJANGO_LOG_FORMAT=json), human-readable in dev
            "formatter": env("DJANGO_LOG_FORMAT", default="plain"),
        },
    },
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", default="INFO")},
}

# ---------------------------------------------------------------- Sentry (NFR-MNT-4)
# Initializes ONLY when a DSN is configured, so dev/test/CI are no-ops (and don't need the package).
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:  # pragma: no cover - exercised only in real deployments
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        release=env("SENTRY_RELEASE", default=""),
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.1),
        send_default_pii=False,  # never ship PII to Sentry (SEC §16)
    )
