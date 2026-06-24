"""Async fan-out for category-subscription emails (FR-SUB-2/3, §9.7)."""
import logging

from celery import shared_task

from apps.core.services import get_setting

logger = logging.getLogger(__name__)


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

    from apps.notifications.services import category_allows, send_branded_email
    snippet = (job.description or "")[:140]
    sent = 0
    for sub in subs.distinct():
        if not category_allows(sub.user, "job_alerts"):  # FR-PROF-9: new-job-in-category category
            continue
        send_branded_email(
            to=sub.user.email,
            subject=f"وظيفة جديدة في «{job.category.name_ar}»: {job.title}",
            body=f"{snippet}…\n\nالميزانية: ${job.budget_min}–${job.budget_max}",
            deep_link=f"/jobs/{job.slug}",
            cta_label="قدّم عرضك",
            fail_silently=False,  # let the retrying task surface SMTP errors
        )
        sent += 1
    logger.info("job %s fan-out: %s emails", job_id, sent)
    return sent
