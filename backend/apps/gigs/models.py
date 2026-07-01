"""Special Services — productized gigs a worker publishes and employers buy
(SRS §4.6 FR-SVC, §9.3). Accepting a buying request creates a Contract that runs
through the same delivery/escrow layer as jobs (§9.4).
"""
import uuid

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.db.models import Q
from django.utils.text import slugify


class Service(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft"
        PENDING_REVIEW = "pending_review"   # services.auto_publish OFF
        LIVE = "live"
        PAUSED = "paused"                   # hidden from discovery, running contracts untouched
        ARCHIVED = "archived"
        REJECTED = "rejected"

    DISCOVERABLE = (Status.LIVE,)

    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="services")
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, allow_unicode=True, blank=True)
    description = models.TextField()
    category = models.ForeignKey("catalog.Category", on_delete=models.PROTECT, related_name="services")
    subcategory = models.ForeignKey("catalog.Category", null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="sub_services")
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_days = models.PositiveSmallIntegerField(default=7)
    cover_image = models.URLField(blank=True)
    # An uploaded cover, served inline via the PUBLIC service-cover-media endpoint (so a plain <img>
    # can render it without a bearer token). Takes precedence over the pasted cover_image URL.
    cover_attachment = models.ForeignKey(
        "attachments.Attachment", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    keywords = models.JSONField(default=list, blank=True)   # ppt slide-19: كلمات مفتاحية (list[str])
    what_you_get = models.TextField(blank=True)             # ppt slide-19: ماذا سيحصل عليه المشتري
    # Optional SEO overrides — when blank the frontend falls back to title / a description excerpt.
    meta_title = models.CharField(max_length=70, blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم عنوان الخدمة عند تركه فارغًا")
    meta_description = models.CharField(max_length=160, blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من الوصف عند تركه فارغًا")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    frozen_prev_status = models.CharField(max_length=16, blank=True, default="")  # restore target on unfreeze (BR-23)
    reject_reason = models.TextField(blank=True)
    favorites_count = models.PositiveIntegerField(default=0)  # denorm
    views_count = models.PositiveIntegerField(default=0)      # ppt slide-20 analytics (denorm)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress micro-services post ID (data migration).",
    )

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [models.Index(fields=["status", "category", "-published_at"])]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        # Guarantee a unique slug on EVERY write path (API create, seed, admin, data import).
        # The field is blank=True + unique=True; without this, two rows inserted with a blank slug
        # (e.g. the API create sets the slug only AFTER insert, and seeds create services with no
        # slug) collide on the unique constraint and raise an unhandled 500 IntegrityError.
        if self.slug:
            return super().save(*args, **kwargs)
        base = slugify(self.title, allow_unicode=True)[:150] or "service"
        # The exists()-then-insert check below is not atomic: two concurrent inserts computing the
        # same slug both see it free and the loser hits the unique constraint. Retry on that race
        # inside a savepoint (so the outer transaction survives) with the next suffix.
        for i in range(1, 8):
            self.slug = base if i == 1 else f"{base}-{i}"
            if Service.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                continue
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError:
                continue
        # Fallback after repeated contention: a random suffix is effectively collision-proof.
        self.slug = f"{base}-{uuid.uuid4().hex[:6]}"
        return super().save(*args, **kwargs)


class ServiceAddon(models.Model):
    """Optional paid extras (the AC-4 'add-ons total')."""

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="addons")
    title = models.CharField(max_length=120)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    extra_days = models.PositiveSmallIntegerField(default=0)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress addons-services post ID (data migration).",
    )

    def __str__(self) -> str:
        return f"{self.title} (+{self.price})"


class ServiceFavorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="service_favorites")
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "service"], name="uniq_service_favorite")]


class Favorite(models.Model):
    """Generic 'save for later' for non-service entities (jobs, freelancers, portfolio works) —
    ppt slide-43. Services keep their dedicated ServiceFavorite (denormalized favorites_count);
    this stores a (kind, object_id) reference so the favourites page can show all four tabs."""

    class Kind(models.TextChoices):
        JOB = "job", "Job"
        FREELANCER = "freelancer", "Freelancer"
        PORTFOLIO = "portfolio", "Portfolio"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorites")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    object_id = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "kind", "object_id"], name="uniq_favorite_user_kind_obj"),
        ]
        indexes = [models.Index(fields=["user", "kind"])]


class BuyingRequest(models.Model):
    """Employer's purchase request against a live service (§9.3). Accept → Contract."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="requests")
    employer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="buying_requests")
    quantity = models.PositiveSmallIntegerField(default=1)
    description = models.TextField(blank=True)
    files = models.JSONField(default=list, blank=True)
    addons = models.ManyToManyField(ServiceAddon, blank=True, related_name="requests")
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # frozen at request time
    delivery_days = models.PositiveSmallIntegerField(default=7)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reject_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=1), name="qty_positive"),
            # BR-21 (employer ≠ service owner) can't be a DB check across a relation —
            # it's enforced in the service layer (request_service) and by the Contract constraint.
        ]

    def __str__(self) -> str:
        return f"request #{self.pk} on service #{self.service_id}"
