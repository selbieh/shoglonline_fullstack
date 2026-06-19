# ppt slide-43: generic Favorite (jobs / freelancers / portfolio). Services keep ServiceFavorite.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("gigs", "0005_service_views_count"),
    ]

    operations = [
        migrations.CreateModel(
            name="Favorite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("job", "Job"), ("freelancer", "Freelancer"), ("portfolio", "Portfolio")], max_length=12)),
                ("object_id", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="favorites", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="favorite",
            index=models.Index(fields=["user", "kind"], name="gigs_fav_user_kind_idx"),
        ),
        migrations.AddConstraint(
            model_name="favorite",
            constraint=models.UniqueConstraint(fields=["user", "kind", "object_id"], name="uniq_favorite_user_kind_obj"),
        ),
    ]
