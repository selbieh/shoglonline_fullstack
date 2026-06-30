import apps.core.phone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cms", "0004_sitesettings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sitesettings",
            name="contact_phone",
            field=models.CharField(
                blank=True,
                default="+20 123 456 7890",
                max_length=40,
                validators=[apps.core.phone.validate_phone],
            ),
        ),
    ]
