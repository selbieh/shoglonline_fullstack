from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0003_invitation_frozen_prev_status_job_frozen_prev_status_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="meta_title",
            field=models.CharField(blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم عنوان الوظيفة عند تركه فارغًا", max_length=70),
        ),
        migrations.AddField(
            model_name="job",
            name="meta_description",
            field=models.CharField(blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من الوصف عند تركه فارغًا", max_length=160),
        ),
    ]
