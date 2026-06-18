from rest_framework import serializers

from ..models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "deep_link", "is_read", "created_at"]

    def get_is_read(self, obj) -> bool:
        return obj.read_at is not None


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ["chat_unread", "job_alerts", "proposal_updates", "marketing", "updated_at"]
        read_only_fields = ["updated_at"]
