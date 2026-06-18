"""Unfold admin user actions (FR-ADM-5 / BR-23): the bulk freeze/activate actions run the full
ripple and write AuditLog entries."""
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory

from apps.accounts.admin import UserAdmin
from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.gigs.models import Service
from tests.factories import ServiceFactory, StaffUserFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _request(staff):
    req = RequestFactory().post("/admin/accounts/user/")
    req.user = staff
    req.session = {}
    req._messages = FallbackStorage(req)
    return req


def test_admin_freeze_then_activate_runs_ripple_and_audits():
    admin = UserAdmin(User, AdminSite())
    staff = StaffUserFactory()
    target = UserFactory()
    service = ServiceFactory(worker=target, status=Service.Status.LIVE)

    admin.freeze_users(_request(staff), User.objects.filter(pk=target.pk))
    target.refresh_from_db()
    service.refresh_from_db()
    assert target.status == User.Status.FROZEN
    assert service.status == Service.Status.PAUSED  # ripple applied through the admin action
    assert AuditLog.objects.filter(action="admin.freeze_user", object_id=str(target.pk),
                                   actor=staff).exists()

    admin.activate_users(_request(staff), User.objects.filter(pk=target.pk))
    target.refresh_from_db()
    service.refresh_from_db()
    assert target.status == User.Status.ACTIVE
    assert service.status == Service.Status.LIVE  # restored
    assert AuditLog.objects.filter(action="admin.activate_user", object_id=str(target.pk)).exists()
