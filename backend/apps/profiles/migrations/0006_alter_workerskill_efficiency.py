# ppt slide-04: add 4th skill level (expert / خبير) to WorkerSkill.efficiency.
# Choices-only change (no schema change); hand-authored to match makemigrations output.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('profiles', '0005_alter_portfolioitem_options_portfolioitem_cover_url_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='workerskill',
            name='efficiency',
            field=models.CharField(
                choices=[
                    ('beginner', 'Beginner'),
                    ('intermediate', 'Intermediate'),
                    ('advanced', 'Advanced'),
                    ('expert', 'Expert'),
                ],
                default='intermediate',
                max_length=12,
            ),
        ),
    ]
