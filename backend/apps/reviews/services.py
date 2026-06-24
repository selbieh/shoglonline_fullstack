"""Review services — completion gating, warranty-window edit lock, profile aggregates."""
from django.db import transaction
from django.db.models import Avg, Count
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Review

ERR = {
    "not_completed": {"code": "contract_not_completed", "message_ar": "التقييم متاح بعد اكتمال العقد فقط"},
    "not_party": {"code": "not_a_party", "message_ar": "لست طرفًا في هذا العقد"},
    "dup": {"code": "already_reviewed", "message_ar": "قيّمت هذا العقد من قبل"},
    "locked": {"code": "review_locked", "message_ar": "انتهت فترة الضمان — لا يمكن تعديل التقييم"},
    "rating": {"code": "bad_rating", "message_ar": "التقييم من 1 إلى 5"},
}


def _subject_of(contract, author):
    return contract.worker if author.id == contract.employer_id else contract.employer


@transaction.atomic
def leave_review(contract, author, *, rating: int, comment: str = "") -> Review:
    """FR-REV-1/4, BR-13: one review per party, completed contracts only."""
    from apps.contracts.models import Contract

    if contract.status != Contract.Status.COMPLETED:
        raise ValidationError(ERR["not_completed"])
    if not contract.is_party(author):
        raise PermissionDenied(ERR["not_party"])
    if not 1 <= int(rating) <= 5:
        raise ValidationError(ERR["rating"])
    if Review.objects.filter(contract=contract, author=author).exists():
        raise ValidationError(ERR["dup"])
    review = Review.objects.create(
        contract=contract, author=author, subject=_subject_of(contract, author),
        rating=int(rating), comment=comment,
        # If the warranty already ended, the review is born locked (no post-hoc edits).
        is_locked=bool(contract.funds_released),
    )
    _recompute_aggregates(review.subject)

    from apps.notifications.models import Notification  # noqa: PLC0415 (avoid import cycle)
    from apps.notifications.services import notify  # noqa: PLC0415
    notify(
        review.subject,
        kind=Notification.Kind.CONTRACT,  # transactional — a received review is always delivered
        title="تلقيت تقييمًا جديدًا",
        body=f"حصلت على تقييم {review.rating}/5 بعد اكتمال العقد.",
        deep_link=f"/contracts/{contract.pk}",
    )
    return review


@transaction.atomic
def edit_review(review: Review, author, *, rating: int, comment: str = "") -> Review:
    """FR-REV-2: editable by the author only within the warranty window (BR-13)."""
    if review.author_id != author.id:
        raise PermissionDenied(ERR["not_party"])
    if review.is_locked:
        raise ValidationError(ERR["locked"])
    if not 1 <= int(rating) <= 5:
        raise ValidationError(ERR["rating"])
    review.rating = int(rating)
    review.comment = comment
    review.save(update_fields=["rating", "comment", "updated_at"])
    _recompute_aggregates(review.subject)
    return review


def lock_contract_reviews(contract) -> int:
    """BR-10/13: at warranty end, all reviews on the contract freeze."""
    return contract.reviews.filter(is_locked=False).update(is_locked=True)


def rating_summary(user) -> dict:
    """Overall reviews received (used for public profile display)."""
    return rating_summary_for(user.id)


def rating_summary_for(user_id) -> dict:
    agg = Review.objects.filter(subject_id=user_id).aggregate(avg=Avg("rating"), count=Count("id"))
    return {"avg": round(agg["avg"] or 0, 2), "count": agg["count"]}


def _recompute_aggregates(user) -> None:
    """Keep the denormalized profile ratings in sync (AC-7), per direction:
    reviews received as the worker feed WorkerProfile; as the employer feed EmployerProfile."""
    from apps.profiles.models import EmployerProfile, WorkerProfile

    as_worker = Review.objects.filter(subject=user, contract__worker=user).aggregate(
        avg=Avg("rating"), count=Count("id")
    )
    as_employer = Review.objects.filter(subject=user, contract__employer=user).aggregate(
        avg=Avg("rating"), count=Count("id")
    )
    wp, _ = WorkerProfile.objects.get_or_create(user=user)
    wp.rating_avg = round(as_worker["avg"] or 0, 2)
    wp.rating_count = as_worker["count"]
    wp.save(update_fields=["rating_avg", "rating_count"])

    ep, _ = EmployerProfile.objects.get_or_create(user=user)
    ep.rating_avg = round(as_employer["avg"] or 0, 2)
    ep.rating_count = as_employer["count"]
    ep.save(update_fields=["rating_avg", "rating_count"])
