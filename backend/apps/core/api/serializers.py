from rest_framework import serializers

from ..models import Report
from ..reports import owner_of, resolve_target


class ReportCreateSerializer(serializers.ModelSerializer):
    """Validates an abuse report and confirms the referenced item actually exists."""

    class Meta:
        model = Report
        fields = ("id", "kind", "object_id", "reason", "detail", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")

    def validate_reason(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("سبب البلاغ مطلوب.")
        return value

    def validate(self, attrs):
        target = resolve_target(attrs["kind"], attrs["object_id"])
        if target is None:
            raise serializers.ValidationError({"object_id": "العنصر غير موجود."})
        reporter = getattr(self.context.get("request"), "user", None)
        if reporter is not None and owner_of(attrs["kind"], target) == reporter:
            raise serializers.ValidationError("لا يمكنك الإبلاغ عن عنصر يخصّك.")
        return attrs
