from .base import *  # noqa: F403

DEBUG = False
GOOGLE_AUTH_STUB = False
PAYPAL_STUB = True  # money tests run the full flow without network
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
# Default to a fast, hermetic in-memory sqlite. CI sets TEST_DATABASE_URL to a Postgres
# service so DB-level constraints/locks (which sqlite doesn't enforce) are exercised there.
DATABASES = {
    "default": env.db(  # noqa: F405
        "TEST_DATABASE_URL", default="sqlite://:memory:"
    )
}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": ()}  # noqa: F405

# Isolate uploaded files from the dev media dir; a fresh temp root per test session.
import tempfile  # noqa: E402

MEDIA_ROOT = tempfile.mkdtemp(prefix="shoghl-test-media-")
