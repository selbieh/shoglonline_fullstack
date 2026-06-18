"""Content pages + FAQ (SRS ADM-6: Content Pages & FAQ CRUD)."""
from django.db import models


class ContentPage(models.Model):
    slug = models.SlugField(max_length=80, unique=True)         # e.g. about, terms, privacy
    title = models.CharField(max_length=160)
    body = models.TextField()                                   # markdown/HTML
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return self.title


class FAQItem(models.Model):
    question = models.CharField(max_length=300)
    answer = models.TextField()
    category = models.CharField(max_length=80, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "order"]

    def __str__(self) -> str:
        return self.question


class LandingSection(models.Model):
    """Admin-controlled landing-page block (hero / feature cards / categories / steps / cta).

    The frontend renders whatever active sections exist (ordered), falling back to
    built-in defaults if none are configured — so the home page is fully editable
    from the admin without a deploy.
    """

    class Kind(models.TextChoices):
        HERO = "hero", "Hero"
        CARDS = "cards", "Feature cards"
        CATEGORIES = "categories", "Category cards"
        STEPS = "steps", "How-it-works steps"
        CTA = "cta", "Call to action"

    key = models.SlugField(max_length=40, unique=True)  # stable id, e.g. "hero"
    kind = models.CharField(max_length=12, choices=Kind.choices)
    heading = models.CharField(max_length=200, blank=True)
    subheading = models.TextField(blank=True)
    # Hero-only optional CTAs (other kinds use cards)
    cta_primary_label = models.CharField(max_length=60, blank=True)
    cta_primary_link = models.CharField(max_length=120, blank=True)
    cta_secondary_label = models.CharField(max_length=60, blank=True)
    cta_secondary_link = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.key}"


class LandingCard(models.Model):
    """A card/tile inside a LandingSection (feature, category, or step)."""

    section = models.ForeignKey(LandingSection, on_delete=models.CASCADE, related_name="cards")
    icon = models.CharField(max_length=8, blank=True)        # emoji
    title = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=240, blank=True)
    link = models.CharField(max_length=120, blank=True)      # e.g. /jobs
    image_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return self.title
