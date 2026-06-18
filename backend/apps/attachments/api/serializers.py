from django.urls import reverse
from rest_framework import serializers

from ..models import Attachment


class AttachmentSerializer(serializers.ModelSerializer):
    """Read shape exposed on hosts: metadata + a SCOPED download url (never the raw media path)."""
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "original_name", "content_type", "size", "kind", "url", "created_at"]

    def get_url(self, obj):
        path = reverse("attachment-download", args=[obj.pk])
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path
