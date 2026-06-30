import apps.core.phone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_legacy_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="phone",
            field=models.CharField(
                blank=True, max_length=20, validators=[apps.core.phone.validate_phone]
            ),
        ),
    ]
