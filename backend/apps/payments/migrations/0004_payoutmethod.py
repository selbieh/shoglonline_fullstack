# ppt slide-38: multi-rail payout destinations (استلام الأرباح). Hand-authored to match
# `makemigrations` output (CreateModel orders non-FK fields first, then the user FK).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0003_commissiontier_paymentmethod"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PayoutMethod",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("paypal", "PayPal"),
                            ("bank_transfer", "Bank transfer"),
                            ("e_wallet", "E-wallet"),
                            ("bank_card", "Bank card"),
                            ("instapay", "Instapay"),
                        ],
                        max_length=14,
                    ),
                ),
                ("label", models.CharField(blank=True, max_length=80)),
                ("country", models.CharField(blank=True, max_length=2)),
                ("details", models.JSONField(default=dict)),
                ("is_default", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payout_methods",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-is_default", "-created_at"],
            },
        ),
    ]
