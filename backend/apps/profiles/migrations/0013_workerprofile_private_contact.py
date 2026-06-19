# ppt slide-02: collect a private external-contact method at onboarding (never shown publicly).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("profiles", "0012_idverification_doc_type_consent"),
    ]

    operations = [
        migrations.AddField(
            model_name="workerprofile",
            name="private_contact_channel",
            field=models.CharField(
                blank=True,
                max_length=12,
                choices=[
                    ("whatsapp", "WhatsApp"),
                    ("phone", "Phone"),
                    ("email", "Email"),
                    ("telegram", "Telegram"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="workerprofile",
            name="private_contact_value",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
