# ppt slide-09: profile publish state (draft → published). Default PUBLISHED so existing
# rows stay visible. Hand-authored to match `makemigrations` output.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0009_portfolioitem_project_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="workerprofile",
            name="publish_state",
            field=models.CharField(
                choices=[("draft", "Draft"), ("published", "Published")],
                default="published",
                max_length=10,
            ),
        ),
    ]
