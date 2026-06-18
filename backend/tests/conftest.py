"""Shared, opt-in test fixtures (see docs/TESTING_STRATEGY.md §3, §14.1).

Most fixtures are opt-in: existing per-file fixtures keep working unchanged. New tests can
`def test_x(api_client, as_user, employer, fund_wallet): ...`.

Two fixtures ARE autouse and matter for correctness:
  * `_isolate_cache` — the test cache is process-global locmem; unlike the DB it is NOT rolled
    back between tests, so a `set_setting()` (which caches) or a throttle counter from one test
    would otherwise bleed into the next. Clearing it per-test makes settings/throttles hermetic.
  * `settings_defaults` — seeds the §22.1 Global Settings catalog at its canonical defaults so
    every test has the rows present (a test that needs a non-default value calls `set_setting`).
"""
from decimal import Decimal

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _isolate_cache():
    """Wipe the (process-global) cache around each test so cached settings/throttle counters
    never leak across tests — the DB rolls back, the cache does not."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def settings_defaults(db):
    """Seed the Global Settings catalog at canonical defaults (idempotent).

    Uses the same DEFAULTS the app ships, so behavior is unchanged from a clean install; a test
    needing a specific flag state calls `set_setting(...)`, which overrides it per-test.
    """
    from apps.core.models import GlobalSetting
    from apps.core.services import DEFAULTS

    rows = [
        GlobalSetting(key=key, value=value, value_type=vtype, category=cat, is_public=pub)
        for key, (value, vtype, cat, pub) in DEFAULTS.items()
    ]
    GlobalSetting.objects.bulk_create(rows, ignore_conflicts=True)


@pytest.fixture
def admin_request():
    """Build a POST request carrying a user + message storage, for testing admin actions directly."""
    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.test import RequestFactory

    def _make(user):
        req = RequestFactory().post("/admin/")
        req.user = user
        req.session = {}
        req._messages = FallbackStorage(req)
        return req
    return _make


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def as_user(api_client):
    def _login(user):
        api_client.force_authenticate(user)
        return api_client
    return _login


@pytest.fixture
def employer(db):
    from apps.accounts.models import User
    return User.objects.create_user(email="employer@example.com", first_name="رب")


@pytest.fixture
def worker(db):
    from apps.accounts.models import User
    from apps.bids.models import BidLedger
    u = User.objects.create_user(email="worker@example.com", first_name="عامل")
    BidLedger.objects.create(user=u, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    return u


@pytest.fixture
def staff(db):
    from apps.accounts.models import User
    return User.objects.create_user(email="staff@example.com", is_staff=True)


@pytest.fixture
def frozen_user(db):
    """A frozen account (BR-23) — asserts the freeze ripple blocks actions everywhere."""
    from apps.accounts.models import User
    return User.objects.create_user(
        email="frozen@example.com", first_name="مجمّد", status=User.Status.FROZEN
    )


@pytest.fixture
def category(db):
    from apps.catalog.models import Category
    return Category.objects.create(name_ar="برمجة", name_en="Dev", slug="dev")


@pytest.fixture
def fund_wallet(db):
    """Credit a user's wallet via a real ledger deposit (keeps the invariant true)."""
    from apps.payments import services as pay
    from apps.payments.models import Transaction

    def _fund(user, amount):
        pay.post(pay.get_wallet(user), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(str(amount)), note="seed")
    return _fund
