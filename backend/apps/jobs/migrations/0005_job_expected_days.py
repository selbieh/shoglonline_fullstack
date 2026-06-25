from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0004_job_meta"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="expected_days",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
