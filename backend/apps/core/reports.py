"""Report target resolution + admin removal actions.

A Report stores a generic (kind, object_id) reference. This module is the single place that maps
a kind onto its concrete model, so the admin queue can (a) link to the reported item and (b) remove
it. "Remove" reuses each model's existing soft-hide status rather than hard-deleting, except for
portfolio works which have no status field and are deleted outright.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from django.urls import NoReverseMatch, reverse


@dataclass(frozen=True)
class TargetSpec:
    """How to load, link, and remove one report kind."""

    load: Callable[[int], object]          # object_id -> instance | None
    admin_route: str                       # admin reverse name, e.g. "admin:gigs_service_change"
    remove: Callable[[object], str]        # instance -> human label of what was done


def _get(model, **kw):
    return model.objects.filter(**kw).first()


def _archive_service(obj) -> str:
    from apps.gigs.models import Service

    obj.status = Service.Status.ARCHIVED
    obj.save(update_fields=["status"])
    return "تمت أرشفة الخدمة (مخفية من العرض)"


def _archive_job(obj) -> str:
    from apps.jobs.models import Job

    obj.status = Job.Status.ARCHIVED
    obj.save(update_fields=["status"])
    return "تمت أرشفة الوظيفة (مخفية من العرض)"


def _reject_freelancer(obj) -> str:
    from apps.profiles.models import WorkerProfile

    obj.publish_state = WorkerProfile.PublishState.REJECTED
    obj.save(update_fields=["publish_state"])
    return "تم إخفاء ملف المستقل (مرفوض من الإدارة)"


def _delete_portfolio(obj) -> str:
    obj.delete()
    return "تم حذف عمل المعرض"


def _withdraw_proposal(obj) -> str:
    from apps.jobs.models import Proposal

    obj.status = Proposal.Status.WITHDRAWN
    obj.save(update_fields=["status"])
    return "تم سحب العرض"


def _cancel_buying_request(obj) -> str:
    from apps.gigs.models import BuyingRequest

    obj.status = BuyingRequest.Status.CANCELLED
    obj.save(update_fields=["status"])
    return "تم إلغاء طلب الشراء"


# kind -> TargetSpec. Loaders use lazy imports so this module stays import-safe at app load.
SPECS: dict[str, TargetSpec] = {
    "service": TargetSpec(
        load=lambda oid: _get(__import__("apps.gigs.models", fromlist=["Service"]).Service, pk=oid),
        admin_route="admin:gigs_service_change",
        remove=_archive_service,
    ),
    "job": TargetSpec(
        load=lambda oid: _get(__import__("apps.jobs.models", fromlist=["Job"]).Job, pk=oid),
        admin_route="admin:jobs_job_change",
        remove=_archive_job,
    ),
    "freelancer": TargetSpec(
        # freelancer reports reference the user id (the public profile is keyed on user)
        load=lambda oid: _get(
            __import__("apps.profiles.models", fromlist=["WorkerProfile"]).WorkerProfile, user_id=oid
        ),
        admin_route="admin:profiles_workerprofile_change",
        remove=_reject_freelancer,
    ),
    "portfolio": TargetSpec(
        load=lambda oid: _get(
            __import__("apps.profiles.models", fromlist=["PortfolioItem"]).PortfolioItem, pk=oid
        ),
        admin_route="admin:profiles_portfolioitem_change",
        remove=_delete_portfolio,
    ),
    "proposal": TargetSpec(
        load=lambda oid: _get(__import__("apps.jobs.models", fromlist=["Proposal"]).Proposal, pk=oid),
        admin_route="admin:jobs_proposal_change",
        remove=_withdraw_proposal,
    ),
    "buying_request": TargetSpec(
        load=lambda oid: _get(
            __import__("apps.gigs.models", fromlist=["BuyingRequest"]).BuyingRequest, pk=oid
        ),
        admin_route="admin:gigs_buyingrequest_change",
        remove=_cancel_buying_request,
    ),
}


def resolve_target(kind: str, object_id: int) -> Optional[object]:
    """Load the reported instance, or None if the kind is unknown or the row is gone."""
    spec = SPECS.get(kind)
    return spec.load(object_id) if spec else None


def target_admin_url(kind: str, target) -> Optional[str]:
    """Admin change-page URL for a resolved target, or None."""
    spec = SPECS.get(kind)
    if not spec or target is None:
        return None
    try:
        return reverse(spec.admin_route, args=[target.pk])
    except NoReverseMatch:
        return None


def remove_target(kind: str, target) -> str:
    """Apply the kind's removal action. Returns a human label; raises KeyError on unknown kind."""
    return SPECS[kind].remove(target)
