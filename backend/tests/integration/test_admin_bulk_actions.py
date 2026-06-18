"""Admin bulk actions with audit (ADM-4): bulk freeze/activate + approve apply across a queryset
and write AuditLog rows (before/after)."""
import pytest
from django.contrib.admin.sites import AdminSite

from apps.accounts.admin import UserAdmin
from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.jobs.admin import ProposalAdmin
from apps.jobs.models import Job, Proposal
from tests.factories import JobFactory, StaffUserFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_bulk_freeze_then_activate_writes_audit(admin_request):
    staff = StaffUserFactory()
    u1, u2 = UserFactory(), UserFactory()
    qs = User.objects.filter(pk__in=[u1.pk, u2.pk])

    UserAdmin(User, AdminSite()).freeze_users(admin_request(staff), qs)
    assert list(qs.values_list("status", flat=True)) == [User.Status.FROZEN, User.Status.FROZEN]
    assert AuditLog.objects.filter(action="admin.freeze_user").count() == 2
    # before/after captured
    log = AuditLog.objects.filter(action="admin.freeze_user", object_id=str(u1.pk)).first()
    assert log.before == {"status": "active"} and log.after["status"] == "frozen"

    UserAdmin(User, AdminSite()).activate_users(admin_request(staff), qs)
    assert set(qs.values_list("status", flat=True)) == {User.Status.ACTIVE}
    assert AuditLog.objects.filter(action="admin.activate_user").count() == 2


def test_bulk_approve_proposals(admin_request):
    staff = StaffUserFactory()
    job = JobFactory(status=Job.Status.PUBLISHED)
    props = [Proposal.objects.create(job=job, worker=UserFactory(), budget=10, delivery_days=2,
                                     description="x", status=Proposal.Status.PENDING_APPROVAL)
             for _ in range(3)]
    qs = Proposal.objects.filter(pk__in=[p.pk for p in props])
    ProposalAdmin(Proposal, AdminSite()).approve_proposals(admin_request(staff), qs)
    assert set(qs.values_list("status", flat=True)) == {Proposal.Status.SUBMITTED}
