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


class Membership(models.Model):
    """Legacy WordPress membership/plan state preserved from the old system (job quota, featured
    slots, plan name, expiry). The new platform monetizes via commission/bids, so this is
    historical/reference data captured by the data migration — not wired into live billing.
    One per user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="membership"
    )
    plan_name = models.CharField(max_length=120, blank=True)             # WooCommerce plan product title
    legacy_plan_id = models.PositiveIntegerField(null=True, blank=True)  # wt_subscription.subscription_id
    jobs_quota = models.PositiveIntegerField(default=0)                  # wt_jobs
    featured_jobs_quota = models.PositiveIntegerField(default=0)         # wt_featured_jobs
    duration_type = models.CharField(max_length=20, blank=True)         # monthly / yearly
    has_banner = models.BooleanField(default=False)                     # wt_banner
    featured_until = models.DateTimeField(null=True, blank=True)        # subscription_featured_expiry
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"membership:{self.user_id} ({self.plan_name})"
