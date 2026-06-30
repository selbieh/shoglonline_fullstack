from rest_framework import serializers

from ..models import User


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(max_length=4096)


class MeSerializer(serializers.ModelSerializer):
    # Email is proven at login (Google SSO or email OTP) — surfaced for the verification chip.
    email_verified = serializers.SerializerMethodField()
    # Write-only: the id of an uploaded image to set as the avatar. The server links it to the user
    # and rewrites `avatar_url` to the PUBLIC inline endpoint — clients never set `avatar_url`
    # directly, since a scoped `/uploads/<id>` URL can't render in an `<img>`. `null` clears it.
    avatar_attachment_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "email_verified",
            "first_name",
            "last_name",
            "avatar_url",
            "avatar_attachment_id",
            "phone",
            "phone_verified",
            "active_mode",
            "status",
            "date_joined",
        ]
        read_only_fields = ["id", "email", "avatar_url", "phone_verified", "status", "date_joined"]

    def get_email_verified(self, obj) -> bool:
        return bool(obj.google_sub) or bool(obj.email)

    def update(self, instance, validated_data):
        # `avatar_attachment_id` is handled out-of-band (link + public URL); it's not a model field.
        set_avatar_id = "avatar_attachment_id" in validated_data
        attachment_id = validated_data.pop("avatar_attachment_id", None)
        instance = super().update(instance, validated_data)
        if set_avatar_id:
            from ..services import set_avatar  # noqa: PLC0415 (avoid import cycle)

            set_avatar(instance, attachment_id, self.context.get("request"))
        return instance


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
    """Body for POST /auth/phone/request-otp (ppt slide-08). Format/region validation lives in
    `services.request_phone_otp` so the `invalid_phone` error code is surfaced consistently."""

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
