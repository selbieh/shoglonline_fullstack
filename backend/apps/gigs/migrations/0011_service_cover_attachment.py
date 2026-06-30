import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("attachments", "0001_initial"),
        ("gigs", "0010_serviceaddon_legacy_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="cover_attachment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="attachments.attachment",
            ),
        ),
    ]
