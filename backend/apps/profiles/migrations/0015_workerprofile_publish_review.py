# rule D-1: a worker submits the profile for review (≥70%) → an admin approves to publish.
# Adds the PENDING_REVIEW/REJECTED states and the review bookkeeping fields.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0014_portfolioitem_budget_features_views"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="workerprofile",
            name="publish_state",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending_review", "Pending review"),
                    ("published", "Published"),
                    ("rejected", "Rejected"),
                ],
                default="published",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="publish_reject_reason",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="publish_reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="publish_reviewed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
