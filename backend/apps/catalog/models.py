"""Categories & skills taxonomy (FR-JOB-13) — translation-ready columns (NFR-LOC-2)."""
from django.db import models


class Category(models.Model):
    # Stable line-icon keys — kept in sync with the frontend `BY_ICON` map in
    # components/CategoryIcon.tsx. Admins pick one from a dropdown; the API
    # returns the key and the frontend renders the matching inline SVG.
    ICON_CHOICES = [
        ("code", "Code / Programming"),
        ("palette", "Palette / Design"),
        ("pen", "Pen / Writing"),
        ("megaphone", "Megaphone / Marketing"),
        ("headset", "Headset / Support"),
        ("bar-chart", "Bar chart / Business"),
        ("mic", "Microphone / Audio"),
        ("compass", "Compass / Consulting"),
        ("grid", "Grid (generic)"),
    ]

    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80, blank=True)  # reserved for future locales
    slug = models.SlugField(unique=True, allow_unicode=True)
    description = models.TextField(blank=True)
    icon = models.CharField(
        max_length=32,
        blank=True,
        choices=ICON_CHOICES,
        help_text="Line-icon shown on the category card (frontend renders this key).",
    )
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name_ar"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name_ar


class Skill(models.Model):
    name_ar = models.CharField(max_length=80)
    slug = models.SlugField(unique=True, allow_unicode=True)
    subcategory = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="skills"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_ar"]

    def __str__(self) -> str:
        return self.name_ar
