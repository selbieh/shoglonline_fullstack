"""Special-services domain logic (SRS §9.3, FR-SVC). Publishing/moderation mirrors
jobs; accepting a buying request hands off to the shared contract layer (§9.4)."""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.contact_guard import contains_contact_info
from apps.core.money import fmt_usd
from apps.core.services import get_setting

from .models import BuyingRequest, Service, ServiceAddon, ServiceFavorite

ERR = {
    "self_buy": {"code": "self_buy", "message_ar": "لا يمكنك شراء خدمتك الخاصة"},
    "not_live": {"code": "service_not_live", "message_ar": "هذه الخدمة غير متاحة للطلب حاليًا"},
    "not_owner": {"code": "not_owner", "message_ar": "لا تملك صلاحية على هذه الخدمة"},
    "not_pending": {"code": "request_not_pending", "message_ar": "لا يمكن تنفيذ الإجراء في حالة الطلب الحالية"},
    "reason": {"code": "reason_required", "message_ar": "السبب إلزامي"},
}


def _unique_slug(title: str) -> str:
    base = slugify(title, allow_unicode=True)[:150] or "service"
    slug, i = base, 1
    while Service.objects.filter(slug=slug).exists():
        i += 1
        slug = f"{base}-{i}"
    return slug


# ------------------------------------------------------------------ lifecycle
def submit_service(service: Service) -> Service:
    """Draft → live (flag ON) or pending_review (flag OFF) — §9.3.

    Contact-info guard is a *soft gate* (mirrors jobs.services.submit_for_publication): a service
    whose public text looks like it shares external contact details is diverted to admin review even
    when auto-publish is ON, instead of being hard-rejected. A false positive then costs only a short
    review wait, never a failed submission."""
    service.slug = service.slug or _unique_slug(service.title)
    flagged = (
        contains_contact_info(service.title)
        or contains_contact_info(service.description)
        or contains_contact_info(service.what_you_get)
    )
    if get_setting("services.auto_publish", False) and not flagged:
        service.status = Service.Status.LIVE
        service.published_at = timezone.now()
    else:
        service.status = Service.Status.PENDING_REVIEW
    service.save()
    return service


def approve_service(service: Service) -> Service:
    service.status = Service.Status.LIVE
    service.published_at = timezone.now()
    service.save(update_fields=["status", "published_at"])
    return service


def set_paused(service: Service, paused: bool) -> Service:
    """Pause/resume hides from discovery without touching running contracts (§9.3)."""
    service.status = Service.Status.PAUSED if paused else Service.Status.LIVE
    service.save(update_fields=["status"])
    return service


def archive_service(service: Service) -> Service:
    service.status = Service.Status.ARCHIVED
    service.save(update_fields=["status"])
    return service


# ------------------------------------------------------------------ favourites
def toggle_favorite(user, service: Service, on: bool) -> None:
    if on:
        _, created = ServiceFavorite.objects.get_or_create(user=user, service=service)
        if created:
            Service.objects.filter(pk=service.pk).update(favorites_count=service.favorites.count())
    else:
        ServiceFavorite.objects.filter(user=user, service=service).delete()
        Service.objects.filter(pk=service.pk).update(favorites_count=service.favorites.count())


# ------------------------------------------------------------------ buying requests
@transaction.atomic
def request_service(*, employer, service: Service, quantity: int = 1, description: str = "",
                    files=None, addon_ids=None) -> BuyingRequest:
    """Employer buys a live service (§9.3). Total = (base + add-ons) × quantity, frozen now."""
    if service.worker_id == employer.id:
        raise PermissionDenied(ERR["self_buy"])  # BR-21
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    assert_active(employer)  # BR-23: a frozen employer cannot buy
    if service.status != Service.Status.LIVE:
        raise ValidationError(ERR["not_live"])

    addons = list(ServiceAddon.objects.filter(service=service, pk__in=addon_ids or []))
    try:
        qty = int(quantity)
    except (TypeError, ValueError):
        raise ValidationError({"code": "bad_quantity", "message_ar": "كمية غير صالحة"})
    qty = min(max(1, qty), 999)  # cap so total_price can't overflow DecimalField(max_digits=12)
    unit = Decimal(service.base_price) + sum((a.price for a in addons), Decimal("0"))
    total = unit * qty
    extra_days = sum((a.extra_days for a in addons), 0)

    request = BuyingRequest.objects.create(
        service=service, employer=employer, quantity=qty, description=description,
        files=files or [], total_price=total, delivery_days=service.delivery_days + extra_days,
    )
    if addons:
        request.addons.set(addons)
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)
    notify(
        service.worker,
        kind="contract",  # transactional — a direct purchase request always reaches the seller
        title=f"طلب جديد على خدمتك: {service.title}",
        body=f"أرسل {employer.first_name or employer.email} طلب شراء بقيمة {fmt_usd(request.total_price)}.",
        deep_link="/me/services",
    )
    return request


@transaction.atomic
def accept_request(request: BuyingRequest, worker):
    """FR-SVC-7: the service owner accepts → a Contract is created and funded (§9.4)."""
    from apps.contracts.services import create_contract_from_request

    request = BuyingRequest.objects.select_for_update().get(pk=request.pk)
    if request.service.worker_id != worker.id:
        raise PermissionDenied(ERR["not_owner"])
    if request.status != BuyingRequest.Status.PENDING:
        raise ValidationError(ERR["not_pending"])
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    assert_active(worker, request.employer)  # BR-23: never bind a contract to a frozen party
    request.status = BuyingRequest.Status.ACCEPTED
    request.save(update_fields=["status"])
    return create_contract_from_request(request)


@transaction.atomic
def reject_request(request: BuyingRequest, worker, reason: str) -> BuyingRequest:
    if request.service.worker_id != worker.id:
        raise PermissionDenied(ERR["not_owner"])
    if request.status != BuyingRequest.Status.PENDING:
        raise ValidationError(ERR["not_pending"])
    if not reason.strip():
        raise ValidationError(ERR["reason"])
    request.status = BuyingRequest.Status.REJECTED
    request.reject_reason = reason
    request.save(update_fields=["status", "reject_reason"])
    return request


@transaction.atomic
def cancel_request(request: BuyingRequest, employer) -> BuyingRequest:
    """Employer cancels before acceptance (§9.3 A2)."""
    if request.employer_id != employer.id:
        raise PermissionDenied(ERR["not_owner"])
    if request.status != BuyingRequest.Status.PENDING:
        raise ValidationError(ERR["not_pending"])
    request.status = BuyingRequest.Status.CANCELLED
    request.save(update_fields=["status"])
    return request
