"""Phase 7 — Special Services (SRS FR-SVC, §9.3, AC-4).

Covers: publish/moderation, pause hides without touching contracts, favourites,
buying request with add-ons total, self-buy blocked (BR-21), accept→funded
contract→delivery→completion reusing the shared contract layer, reject/cancel.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Category
from apps.contracts import services as cs
from apps.contracts.models import Contract
from apps.core.services import set_setting
from apps.gigs import services as gs
from apps.gigs.models import BuyingRequest, Service, ServiceAddon
from apps.payments import services as pay
from apps.payments.models import Transaction


@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("services.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)


@pytest.fixture()
def worker(db):
    return User.objects.create_user(email="wk@example.com", first_name="مستقل")


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="emp@example.com", first_name="مشترٍ")


@pytest.fixture()
def category(db):
    return Category.objects.create(name_ar="تصميم", name_en="Design", slug="design")


def make_service(worker, category, *, price="100", live=True):
    service = Service.objects.create(worker=worker, title="تصميم شعار", description="وصف",
                                     category=category, base_price=Decimal(price), delivery_days=5)
    if live:
        gs.submit_service(service)
    return service


def fund(user, amount):
    pay.post(pay.get_wallet(user), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(str(amount)), note="seed")


# ------------------------------------------------------------------ lifecycle
@pytest.mark.django_db
class TestServiceLifecycle:
    def test_auto_publish_goes_live(self, worker, category):
        service = make_service(worker, category)
        assert service.status == Service.Status.LIVE
        assert service.slug

    def test_moderation_holds_for_review(self, worker, category):
        set_setting("services.auto_publish", False)
        service = make_service(worker, category)
        assert service.status == Service.Status.PENDING_REVIEW

    def test_pause_hides_without_touching_contracts(self, worker, employer, category):
        service = make_service(worker, category, price="100")
        fund(employer, "150")
        req = gs.request_service(employer=employer, service=service)
        contract = gs.accept_request(req, worker)
        gs.set_paused(service, True)
        service.refresh_from_db()
        contract.refresh_from_db()
        assert service.status == Service.Status.PAUSED  # off discovery
        assert contract.status == Contract.Status.ACTIVE  # running contract untouched (§9.3)


# ------------------------------------------------------------------ favourites
@pytest.mark.django_db
class TestFavorites:
    def test_toggle_favorite(self, worker, employer, category):
        service = make_service(worker, category)
        gs.toggle_favorite(employer, service, True)
        service.refresh_from_db()
        assert service.favorites_count == 1
        gs.toggle_favorite(employer, service, False)
        service.refresh_from_db()
        assert service.favorites_count == 0


# ------------------------------------------------------------------ buying + contract
@pytest.mark.django_db
class TestBuying:
    def test_total_includes_addons_and_quantity(self, worker, employer, category):
        service = make_service(worker, category, price="100")
        addon = ServiceAddon.objects.create(service=service, title="استعجال", price=Decimal("20"), extra_days=0)
        req = gs.request_service(employer=employer, service=service, quantity=2, addon_ids=[addon.pk])
        assert req.total_price == Decimal("240")  # (100 + 20) × 2

    def test_self_buy_blocked(self, worker, category):
        service = make_service(worker, category)
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            gs.request_service(employer=worker, service=service)  # BR-21

    def test_cannot_buy_paused_service(self, worker, employer, category):
        service = make_service(worker, category)
        gs.set_paused(service, True)
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            gs.request_service(employer=employer, service=service)

    def test_accept_creates_funded_contract(self, worker, employer, category):
        service = make_service(worker, category, price="100")
        fund(employer, "150")
        req = gs.request_service(employer=employer, service=service)
        contract = gs.accept_request(req, worker)
        assert contract.status == Contract.Status.ACTIVE
        assert contract.service_id == service.id
        assert contract.worker_id == worker.id and contract.employer_id == employer.id
        assert pay.get_wallet(employer).escrow_held == Decimal("100")  # BR-9 reused
        req.refresh_from_db()
        assert req.status == BuyingRequest.Status.ACCEPTED

    def test_full_service_delivery_to_completion(self, worker, employer, category):
        service = make_service(worker, category, price="100")
        fund(employer, "150")
        req = gs.request_service(employer=employer, service=service)
        contract = gs.accept_request(req, worker)
        sub = cs.submit_deliverable(contract, worker, notes="تم التصميم")
        cs.accept_submission(sub, employer)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.COMPLETED  # AC-4 end to end
        assert pay.get_wallet(worker).earnings_pending == Decimal("90")

    def test_only_owner_accepts(self, worker, employer, category):
        service = make_service(worker, category)
        fund(employer, "150")
        req = gs.request_service(employer=employer, service=service)
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            gs.accept_request(req, employer)

    def test_reject_and_cancel(self, worker, employer, category):
        service = make_service(worker, category)
        r1 = gs.request_service(employer=employer, service=service)
        gs.reject_request(r1, worker, "خارج نطاق خدمتي")
        r1.refresh_from_db()
        assert r1.status == BuyingRequest.Status.REJECTED
        r2 = gs.request_service(employer=employer, service=service)
        gs.cancel_request(r2, employer)
        r2.refresh_from_db()
        assert r2.status == BuyingRequest.Status.CANCELLED


# ------------------------------------------------------------------ API smoke
@pytest.mark.django_db
class TestServiceAPI:
    def test_browse_and_buy_flow(self, worker, employer, category):
        make_service(worker, category, price="100")
        anon = APIClient()
        listing = anon.get("/api/v1/services")
        assert listing.status_code == 200 and listing.json()["count"] == 1
        slug = listing.json()["results"][0]["slug"]

        eclient = APIClient()
        eclient.force_authenticate(employer)
        detail = eclient.get(f"/api/v1/services/{slug}")
        sid = detail.json()["id"]
        fund(employer, "150")
        res = eclient.post(f"/api/v1/services/{sid}/requests", {"quantity": 1}, format="json")
        assert res.status_code == 201
        rid = res.json()["id"]

        wclient = APIClient()
        wclient.force_authenticate(worker)
        acc = wclient.post(f"/api/v1/requests/{rid}/accept", format="json")
        assert acc.status_code == 201
        assert acc.json()["contract_status"] == "active"

    def test_publish_via_api(self, worker, category):
        set_setting("services.auto_publish", False)
        client = APIClient()
        client.force_authenticate(worker)
        res = client.post("/api/v1/me/services", {
            "title": "كتابة محتوى", "description": "وصف", "category": category.id, "base_price": "50",
            "delivery_days": 3,
        }, format="json")
        assert res.status_code == 201
        assert res.json()["status"] == "pending_review"  # moderation flag OFF
