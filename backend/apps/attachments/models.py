"""Single attachment pipeline reused by every host that takes files (Part 03, FR-*-files).

An Attachment is uploaded standalone (owned by the uploader), then LINKED to a host row
(job / proposal / submission / chat message / ticket …) via a generic relation when the host is
created. Downloads are served only through the scoped API view, never by guessing the media path.
"""
import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


def attachment_path(instance: "Attachment", filename: str) -> str:
    # owner-scoped + random folder so files are non-enumerable and never collide
    return f"attachments/{instance.owner_id}/{uuid.uuid4().hex}/{filename}"


class Attachment(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "image"
        VIDEO = "video"
        AUDIO = "audio"
        DOCUMENT = "document"
        ARCHIVE = "archive"
        OTHER = "other"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="attachments")
    file = models.FileField(upload_to=attachment_path, max_length=500)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120)
    size = models.PositiveBigIntegerField()
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.OTHER)

    # generic link to the host row; NULL until the attachment is attached on host create.
    host_type = models.ForeignKey(ContentType, null=True, blank=True, on_delete=models.SET_NULL)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    host = GenericForeignKey("host_type", "object_id")

    is_deleted = models.BooleanField(default=False)  # soft-delete (orphan sweep / host removal)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["host_type", "object_id"])]

    def __str__(self) -> str:
        return f"{self.original_name} ({self.kind})"

    @property
    def is_linked(self) -> bool:
        return self.host_type_id is not None
