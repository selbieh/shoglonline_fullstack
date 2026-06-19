# ppt slide-08: capture document type + consent on the ID verification request.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0011_employerprofile_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="idverification",
            name="doc_type",
            field=models.CharField(blank=True, default="", max_length=20),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="idverification",
            name="consent",
            field=models.BooleanField(default=False),
        ),
    ]
