# ppt slide-22 (work showcase): portfolio budget + feature bullets + public view counter.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0013_workerprofile_private_contact"),
    ]

    operations = [
        migrations.AddField(
            model_name="portfolioitem",
            name="budget",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="features",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="portfolioitem",
            name="views_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
