import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Report",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("service", "Service"), ("job", "Job"), ("freelancer", "Freelancer"), ("portfolio", "Portfolio"), ("proposal", "Proposal"), ("buying_request", "Buying request")], max_length=20)),
                ("object_id", models.PositiveIntegerField()),
                ("reason", models.CharField(max_length=40)),
                ("detail", models.CharField(blank=True, max_length=1000)),
                ("status", models.CharField(choices=[("open", "Open"), ("dismissed", "Dismissed"), ("actioned", "Actioned")], default="open", max_length=10)),
                ("resolution", models.CharField(blank=True, max_length=200)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("reporter", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reports_filed", to=settings.AUTH_USER_MODEL)),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="report",
            index=models.Index(fields=["kind", "object_id"], name="core_report_kind_obj_idx"),
        ),
        migrations.AddIndex(
            model_name="report",
            index=models.Index(fields=["status", "-created_at"], name="core_report_status_idx"),
        ),
        migrations.AddConstraint(
            model_name="report",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status", "open")),
                fields=["reporter", "kind", "object_id"],
                name="uniq_open_report_per_user_item",
            ),
        ),
    ]
