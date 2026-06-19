# ppt slide-20: service views counter for the owner analytics panel.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gigs", "0004_service_keywords_what_you_get"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="views_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
