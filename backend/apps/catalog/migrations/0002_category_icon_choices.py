"""Turn Category.icon into a dropdown of stable line-icon keys.

Widens the column (8 → 32; "bar-chart" is 9 chars), adds choices, and converts
the legacy emoji values to keys. Mapped by top-level slug so the conversion is
robust to emoji variation selectors. Keep the key set in sync with the frontend
`BY_ICON` map in frontend/components/CategoryIcon.tsx.
"""
from django.db import migrations, models

SLUG_TO_ICON = {
    "programming-tech": "code",
    "design-creative": "palette",
    "writing-translation": "pen",
    "digital-marketing": "megaphone",
    "sales-support": "headset",
    "business-finance": "bar-chart",
    "audio-voice": "mic",
    "consulting": "compass",
}
VALID = set(SLUG_TO_ICON.values()) | {"grid"}

ICON_TO_EMOJI = {
    "code": "💻", "palette": "🎨", "pen": "✍️", "megaphone": "📣",
    "headset": "☎️", "bar-chart": "📊", "mic": "🎙️", "compass": "🧭",
}


def emoji_to_key(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for cat in Category.objects.all():
        key = SLUG_TO_ICON.get(cat.slug)
        if key:
            cat.icon = key
        elif cat.icon not in VALID:
            cat.icon = ""  # drop legacy emoji / unknown values to a valid blank state
        cat.save(update_fields=["icon"])


def key_to_emoji(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for cat in Category.objects.all():
        cat.icon = ICON_TO_EMOJI.get(cat.icon, "")
        cat.save(update_fields=["icon"])


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="category",
            name="icon",
            field=models.CharField(
                blank=True,
                max_length=32,
                choices=[
                    ("code", "Code / Programming"),
                    ("palette", "Palette / Design"),
                    ("pen", "Pen / Writing"),
                    ("megaphone", "Megaphone / Marketing"),
                    ("headset", "Headset / Support"),
                    ("bar-chart", "Bar chart / Business"),
                    ("mic", "Microphone / Audio"),
                    ("compass", "Compass / Consulting"),
                    ("grid", "Grid (generic)"),
                ],
                help_text="Line-icon shown on the category card (frontend renders this key).",
            ),
        ),
        migrations.RunPython(emoji_to_key, key_to_emoji),
    ]
