"""Mutual reviews tied to completed contracts (SRS FR-REV, BR-13).

One review per party per contract; 1–5 + comment; editable within the warranty
period, locked when it ends (BR-10/13). No drive-by reviews — a review can only
exist for a Completed contract the author is a party to.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class Review(models.Model):
    contract = models.ForeignKey("contracts.Contract", on_delete=models.CASCADE, related_name="reviews")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_written")
    subject = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_received")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    is_locked = models.BooleanField(default=False)  # frozen at warranty end (BR-13)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["contract", "author"], name="uniq_review_per_author_per_contract"),
            models.CheckConstraint(condition=~Q(author=models.F("subject")), name="review_no_self"),  # BR-21
        ]

    def __str__(self) -> str:
        return f"review {self.rating}★ on contract #{self.contract_id}"
