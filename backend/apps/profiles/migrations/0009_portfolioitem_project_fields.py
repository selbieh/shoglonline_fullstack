# ppt slides 05/23: enrich PortfolioItem into a project (type, link, duration, skills,
# completion date, ownership flag). Hand-authored to match `makemigrations` output — non-null
# CharFields take a one-off default="" via preserve_default=False; others are nullable/defaulted.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0008_certificate"),
    ]

    operations = [
        migrations.AddField(
            model_name="portfolioitem",
            name="project_type",
            field=models.CharField(blank=True, default="", max_length=80),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="project_link",
            field=models.URLField(blank=True, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="duration_value",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="duration_unit",
            field=models.CharField(
                blank=True,
                choices=[("day", "Day"), ("month", "Month")],
                default="",
                max_length=8,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="skills",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="completed_at",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="ownership_confirmed",
            field=models.BooleanField(default=False),
        ),
    ]
