# ppt slides 02/03/07: profile foundation fields on WorkerProfile.
# Hand-authored to match `makemigrations` output (CharFields added to existing rows take a
# one-off default="" via preserve_default=False; nullable/defaulted fields need no backfill).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalog", "0001_initial"),
        ("profiles", "0006_alter_workerskill_efficiency"),
    ]

    operations = [
        migrations.AddField(
            model_name="workerprofile",
            name="display_name",
            field=models.CharField(blank=True, default="", max_length=120),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="intro_video",
            field=models.URLField(blank=True, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="main_category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="catalog.category",
            ),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="specialization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="catalog.category",
            ),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="years_experience",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="availability",
            field=models.CharField(
                choices=[
                    ("available_now", "Available now"),
                    ("available_soon", "Available soon"),
                    ("unavailable", "Unavailable"),
                ],
                default="available_now",
                max_length=14,
            ),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="weekly_hours",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="client_notes",
            field=models.CharField(blank=True, default="", max_length=300),
            preserve_default=False,
        ),
    ]
