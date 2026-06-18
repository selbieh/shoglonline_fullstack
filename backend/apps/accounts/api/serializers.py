from rest_framework import serializers

from ..models import User


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(max_length=4096)


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "avatar_url",
            "phone",
            "phone_verified",
            "active_mode",
            "status",
            "date_joined",
        ]
        read_only_fields = ["id", "email", "phone_verified", "status", "date_joined"]


class ModeSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=User.Mode.choices)


class DeleteAccountSerializer(serializers.Serializer):
    """Body for DELETE /me (FR-PROF-7): a reason (required) and optional free text."""

    reason = serializers.CharField(max_length=80)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
