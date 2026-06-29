# A signup must NOT auto-publish as a freelancer. Lazily auto-created profiles previously
# defaulted to PUBLISHED, so any new account that merely opened /me/profile appeared in the
# public freelancer directory with an empty profile. Default is now DRAFT (rule D-1: a worker
# is public only after they explicitly publish). The data step demotes the empty, never-reviewed
# PUBLISHED shells the old default left behind — real/seeded profiles (which have content) stay
# published.
from django.db import migrations, models
from django.db.models import Count


def demote_empty_shells(apps, schema_editor):
    WorkerProfile = apps.get_model("profiles", "WorkerProfile")
    (
        WorkerProfile.objects.filter(
            publish_state="published",
            publish_reviewed_at__isnull=True,  # never went through admin approval
            # 0%-complete shell: none of the six wizard fields the completeness gate counts is set.
            bio_title="",
            overview="",
            expertise_level="",
            hourly_rate__isnull=True,
        )
        .annotate(n_skills=Count("skills"), n_languages=Count("languages"))
        .filter(n_skills=0, n_languages=0)
        .update(publish_state="draft")
    )


def noop(apps, schema_editor):
    # Irreversible by design: we can't tell which demoted shells were intentionally published.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0015_workerprofile_publish_review"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workerprofile",
            name="publish_state",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("pending_review", "Pending review"),
                    ("published", "Published"),
                    ("rejected", "Rejected"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.RunPython(demote_empty_shells, noop),
    ]
