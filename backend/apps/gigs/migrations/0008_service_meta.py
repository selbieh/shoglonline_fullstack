from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("gigs", "0007_rename_gigs_fav_user_kind_idx_gigs_favori_user_id_439f5c_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="meta_title",
            field=models.CharField(blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم عنوان الخدمة عند تركه فارغًا", max_length=70),
        ),
        migrations.AddField(
            model_name="service",
            name="meta_description",
            field=models.CharField(blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من الوصف عند تركه فارغًا", max_length=160),
        ),
    ]
