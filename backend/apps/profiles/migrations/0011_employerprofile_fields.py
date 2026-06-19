# ppt slide-26: employer profile fields (field/location/timezone/logo). Hand-authored to
# match makemigrations output — non-null CharFields take a one-off default="".

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0010_workerprofile_publish_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="employerprofile",
            name="field",
            field=models.CharField(blank=True, default="", max_length=120),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="employerprofile",
            name="country",
            field=models.CharField(blank=True, default="", max_length=64),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="employerprofile",
            name="city",
            field=models.CharField(blank=True, default="", max_length=64),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="employerprofile",
            name="timezone",
            field=models.CharField(blank=True, default="", max_length=48),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="employerprofile",
            name="logo_url",
            field=models.URLField(blank=True, default=""),
            preserve_default=False,
        ),
    ]
