from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cms", "0002_landingsection_landingcard"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentpage",
            name="meta_title",
            field=models.CharField(blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم العنوان عند تركه فارغًا", max_length=70),
        ),
        migrations.AddField(
            model_name="contentpage",
            name="meta_description",
            field=models.CharField(blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من المحتوى عند تركه فارغًا", max_length=160),
        ),
    ]
