"""Admin moderation queues (ADM-4/5, §9.9): approve publishes + notifies; reject sets status +
sends the Arabic reason; archive is a soft-delete (BR-17), never a hard delete."""
import pytest
from django.contrib.admin.sites import AdminSite

from apps.core.models import AuditLog
from apps.gigs.admin import ServiceAdmin
from apps.gigs.models import Service
from apps.jobs.admin import JobAdmin
from apps.jobs.models import Job
from apps.notifications.models import Notification
from tests.factories import JobFactory, ServiceFactory, StaffUserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_approve_job_publishes_notifies_and_audits(admin_request):
    staff = StaffUserFactory()
    job = JobFactory(status=Job.Status.PENDING_REVIEW)
    JobAdmin(Job, AdminSite()).approve_jobs(admin_request(staff), Job.objects.filter(pk=job.pk))

    job.refresh_from_db()
    assert job.status == Job.Status.PUBLISHED
    assert AuditLog.objects.filter(action="admin.approve_job", object_id=str(job.pk)).exists()
    assert Notification.objects.filter(user=job.employer, title="تم نشر وظيفتك").exists()


def test_reject_job_sets_status_with_reason_and_notifies(admin_request):
    staff = StaffUserFactory()
    job = JobFactory(status=Job.Status.PENDING_REVIEW)
    JobAdmin(Job, AdminSite()).reject_jobs(admin_request(staff), Job.objects.filter(pk=job.pk))

    job.refresh_from_db()
    assert job.status == Job.Status.REJECTED
    assert job.reject_reason  # Arabic reason stored
    note = Notification.objects.get(user=job.employer, title="رُفضت وظيفتك")
    assert note.body == job.reject_reason


def test_archive_is_soft_delete(admin_request):
    staff = StaffUserFactory()
    job = JobFactory(status=Job.Status.PUBLISHED)
    JobAdmin(Job, AdminSite()).archive_jobs(admin_request(staff), Job.objects.filter(pk=job.pk))
    job.refresh_from_db()
    assert job.status == Job.Status.ARCHIVED  # BR-17: archived, not hard-deleted
    assert Job.objects.filter(pk=job.pk).exists()


def test_approve_service_publishes_notifies_and_audits(admin_request):
    staff = StaffUserFactory()
    service = ServiceFactory(status=Service.Status.PENDING_REVIEW)
    ServiceAdmin(Service, AdminSite()).approve_services(admin_request(staff), Service.objects.filter(pk=service.pk))

    service.refresh_from_db()
    assert service.status == Service.Status.LIVE
    assert service.published_at is not None
    assert AuditLog.objects.filter(action="admin.service_approved", object_id=str(service.pk)).exists()
    assert Notification.objects.filter(user=service.worker, title="تم نشر خدمتك").exists()


def test_service_reject_audited_and_notifies(admin_request):
    staff = StaffUserFactory()
    service = ServiceFactory(status=Service.Status.PENDING_REVIEW)
    ServiceAdmin(Service, AdminSite()).reject_services(admin_request(staff), Service.objects.filter(pk=service.pk))
    service.refresh_from_db()
    assert service.status == Service.Status.REJECTED
    assert AuditLog.objects.filter(action="admin.service_rejected", object_id=str(service.pk)).exists()
    note = Notification.objects.get(user=service.worker, title="رُفضت خدمتك")
    assert note.body == service.reject_reason  # Arabic reason delivered
