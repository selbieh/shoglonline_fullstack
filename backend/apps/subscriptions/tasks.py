"""Async fan-out for category-subscription emails (FR-SUB-2/3, §9.7)."""
import logging

from celery import shared_task
from django.core.mail import send_mail

from apps.core.services import get_setting

logger = logging.getLogger(__name__)

FRONTEND_URL = "http://localhost:3000"  # TODO: env-driven in production settings


@shared_task(bind=True, max_retries=3, retry_backoff=True)
def fanout_job_published(self, job_id: int) -> int:
    """Email every active subscriber of the job's category/subcategory.

    Idempotency-safe: re-delivery sends at most once per run; EmailLog dedupe
    arrives with the notifications app (Phase 5).
    """
    from apps.jobs.models import Job

    from .models import CategorySubscription

    if not (get_setting("subscriptions.enabled", True) and get_setting("emails.enabled", True)):
        return 0

    try:
        job = Job.objects.select_related("category", "employer").get(pk=job_id)
    except Job.DoesNotExist:
        return 0
    if job.status != Job.Status.PUBLISHED:
        return 0

    subs = (
        CategorySubscription.objects.filter(category=job.category)
        .exclude(user=job.employer)  # BR-21: never notify the poster about their own job
        .select_related("user")
    )
    if job.subcategory_id:
        subs = subs.filter(subcategory__isnull=True) | subs.filter(subcategory_id=job.subcategory_id)

    from apps.notifications.services import category_allows
    snippet = (job.description or "")[:140]
    sent = 0
    for sub in subs.distinct():
        if not category_allows(sub.user, "job_alerts"):  # FR-PROF-9: new-job-in-category category
            continue
        send_mail(
            subject=f"وظيفة جديدة في «{job.category.name_ar}»: {job.title}",
            message=(
                f"{snippet}…\n\n"
                f"الميزانية: {job.budget_min}–{job.budget_max} د.ك\n"
                f"قدّم عرضك: {FRONTEND_URL}/jobs/{job.slug}\n\n"
                "لإلغاء الاشتراك من هذه الفئة: "
                f"{FRONTEND_URL}/notifications"
            ),
            from_email=None,
            recipient_list=[sub.user.email],
            fail_silently=False,
        )
        sent += 1
    logger.info("job %s fan-out: %s emails", job_id, sent)
    return sent
