from rest_framework import serializers

from ..models import User


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(max_length=4096)


class MeSerializer(serializers.ModelSerializer):
    # Email is proven at login (Google SSO or email OTP) — surfaced for the verification chip.
    email_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "email_verified",
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

    def get_email_verified(self, obj) -> bool:
        return bool(obj.google_sub) or bool(obj.email)


class EmailOTPRequestSerializer(serializers.Serializer):
    """Body for POST /auth/email/request-otp. CharField (not EmailField) so the service-level
    `invalid_email` code surfaces instead of a generic DRF field error."""

    email = serializers.CharField(max_length=254)


class EmailOTPVerifySerializer(serializers.Serializer):
    """Body for POST /auth/email/verify-otp. Complex code (letters+digits+specials); exact value is
    checked server-side, so accept a sane length band and trim whitespace (paste-friendly)."""

    email = serializers.CharField(max_length=254)
    code = serializers.CharField(min_length=4, max_length=16, trim_whitespace=True)


class PhoneOTPRequestSerializer(serializers.Serializer):
    """Body for POST /auth/phone/request-otp (ppt slide-08)."""

    phone = serializers.CharField(max_length=20)


class PhoneOTPVerifySerializer(serializers.Serializer):
    """Body for POST /auth/phone/verify-otp (ppt slide-08)."""

    code = serializers.CharField(min_length=4, max_length=6)


class ModeSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=User.Mode.choices)


class DeleteAccountSerializer(serializers.Serializer):
    """Body for DELETE /me (FR-PROF-7): a reason (required) and optional free text."""

    reason = serializers.CharField(max_length=80)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
