"""Category subscriptions — account-level, mode-independent (FR-SUB-1)."""
from django.conf import settings
from django.db import models


class CategorySubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="category_subscriptions"
    )
    category = models.ForeignKey("catalog.Category", on_delete=models.CASCADE, related_name="subscriptions")
    subcategory = models.ForeignKey(
        "catalog.Category", null=True, blank=True, on_delete=models.CASCADE, related_name="sub_subscriptions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "category", "subcategory"], name="uniq_subscription"
            ),
        ]
