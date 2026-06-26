"""Content pages + FAQ (SRS ADM-6: Content Pages & FAQ CRUD)."""
from django.db import models


class ContentPage(models.Model):
    slug = models.SlugField(max_length=80, unique=True)         # e.g. about, terms, privacy
    title = models.CharField(max_length=160)
    body = models.TextField()                                   # markdown/HTML
    # Optional SEO overrides — when blank the frontend falls back to title / a body excerpt.
    meta_title = models.CharField(max_length=70, blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم العنوان عند تركه فارغًا")
    meta_description = models.CharField(max_length=160, blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من المحتوى عند تركه فارغًا")
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


class SiteSettings(models.Model):
    """Singleton holding the footer's contact details, mobile-app links, and social URLs.

    Editable from the admin without a deploy (FR-CMS). Every field is optional — the public
    footer hides any line/icon/badge whose value is blank, so an operator turns an entry off
    simply by clearing it. Field defaults seed sensible values on first load so the footer
    looks complete out of the box (good shape for testing/staging).
    """

    # Contact ("تواصل معنا")
    contact_email = models.EmailField(blank=True, default="support@shoglonline.com")
    contact_phone = models.CharField(max_length=40, blank=True, default="+20 123 456 7890")
    contact_address = models.CharField(max_length=200, blank=True, default="القاهرة، مصر")

    # Mobile app store links (footer badges) — blank hides the badge.
    app_store_url = models.URLField(blank=True, default="https://apps.apple.com/app/shoglonline")
    google_play_url = models.URLField(
        blank=True, default="https://play.google.com/store/apps/details?id=com.shoglonline")

    # Social profiles — blank hides the icon.
    facebook_url = models.URLField(blank=True, default="https://facebook.com/shoglonline")
    twitter_url = models.URLField(blank=True, default="https://twitter.com/shoglonline")
    instagram_url = models.URLField(blank=True, default="https://instagram.com/shoglonline")
    youtube_url = models.URLField(blank=True, default="https://youtube.com/@shoglonline")
    linkedin_url = models.URLField(blank=True, default="https://linkedin.com/company/shoglonline")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Site settings"
        verbose_name_plural = "Site settings"

    def __str__(self) -> str:
        return "إعدادات الموقع"

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce singleton
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
