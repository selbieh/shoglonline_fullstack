from .base import *  # noqa: F403
from .base import env

DEBUG = True
ALLOWED_HOSTS = ["*"]
GOOGLE_AUTH_STUB = env.bool("GOOGLE_AUTH_STUB", default=True)  # dev login without a client id
PAYPAL_STUB = env.bool("PAYPAL_STUB", default=True)  # dev charge without PayPal credentials
CORS_ALLOW_ALL_ORIGINS = True
