# ppt slide-06: training certificates (الشهادات التدريبية). Hand-authored to match
# `makemigrations` output. The optional file is linked via the attachments GenericRelation
# (virtual — no column here), mirroring PortfolioItem.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0007_workerprofile_foundation_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="Certificate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("issuer", models.CharField(blank=True, max_length=160)),
                ("cert_type", models.CharField(blank=True, max_length=80)),
                ("issued_month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("issued_year", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("expiry_month", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("expiry_year", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("no_expiry", models.BooleanField(default=False)),
                ("credential_id", models.CharField(blank=True, max_length=120)),
                ("verification_link", models.URLField(blank=True)),
                ("skills", models.JSONField(blank=True, default=list)),
                ("order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="certificates",
                        to="profiles.workerprofile",
                    ),
                ),
            ],
            options={
                "ordering": ["order", "id"],
            },
        ),
    ]
