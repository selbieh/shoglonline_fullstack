# ppt slide-19: service keywords + "what you get". Hand-authored to match makemigrations
# output (TextField added to existing rows takes a one-off default="" via preserve_default).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gigs", "0003_service_frozen_prev_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="keywords",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="service",
            name="what_you_get",
            field=models.TextField(blank=True, default=""),
            preserve_default=False,
        ),
    ]
