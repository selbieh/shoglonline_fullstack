from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.core.models import AuditLog

from ..models import User
from ..services import (
    account_deletion_blockers,
    authenticate_google_user,
    confirm_email_change,
    delete_account,
    request_email_change,
    request_login_otp,
    request_phone_otp,
    verify_login_otp,
    verify_phone_otp,
)
from .serializers import (
    DeleteAccountSerializer,
    EmailOTPRequestSerializer,
    EmailOTPVerifySerializer,
    GoogleLoginSerializer,
    MeSerializer,
    ModeSerializer,
    PhoneOTPRequestSerializer,
    PhoneOTPVerifySerializer,
)


def _client_ip(request) -> str | None:
    """Resolve the client IP the SAME way DRF's throttles key on it (api_settings.NUM_PROXIES), so
    the audit IP and the rate-limit bucket agree and a spoofed X-Forwarded-For can't bypass either."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    remote = request.META.get("REMOTE_ADDR")
    num_proxies = api_settings.NUM_PROXIES
    if num_proxies is not None:
        if num_proxies == 0 or not xff:
            return remote
        addrs = xff.split(",")
        return addrs[-min(num_proxies, len(addrs))].strip()
    return "".join(xff.split()) if xff else remote


class GoogleLoginView(APIView):
    """POST /api/v1/auth/google — the ONLY end-user auth entry point (FR-AUTH-1..3).

    Body: {"id_token": "<google id token>"}
    Returns: {access, refresh, first_login, user}
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_scope = "auth"  # SEC-5

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ip = _client_ip(request)
        try:
            user, created = authenticate_google_user(serializer.validated_data["id_token"], ip=ip)
        except (PermissionDenied, AuthenticationFailed) as exc:  # FR-AUTH-7: audit failures too
            AuditLog.objects.create(
                actor=None, action="auth.login_failed", ip=ip,
                after={"detail": str(getattr(exc, "detail", exc))[:200]},
            )
            raise
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "first_login": created or not user.active_mode,  # route to mode selection (FR-MODE-1)
                "user": MeSerializer(user).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """POST /api/v1/auth/logout — blacklist the refresh token (FR-AUTH-4)."""

    def post(self, request):
        token = request.data.get("refresh")
        if token:
            try:
                RefreshToken(token).blacklist()
            except Exception:  # noqa: BLE001 — already invalid is fine
                pass
        AuditLog.objects.create(  # FR-AUTH-7
            actor=request.user if request.user.is_authenticated else None,
            action="auth.logout", ip=_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AuditedTokenRefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh — rotate the access token and audit the event (FR-AUTH-7)."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user_id = None
            try:
                user_id = AccessToken(response.data["access"])["user_id"]
            except Exception:  # noqa: BLE001 — never let auditing break a valid refresh
                pass
            AuditLog.objects.create(actor_id=user_id, action="auth.refresh", ip=_client_ip(request))
        return response


class MeView(RetrieveUpdateAPIView):
    """GET/PATCH/DELETE /api/v1/auth/me — basic account info (FR-PROF-1) + self-deletion (FR-PROF-7)."""

    serializer_class = MeSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self) -> User:
        return self.request.user

    def delete(self, request, *args, **kwargs):
        """BR-2: blocked while money/commitments are in flight (returns the exact blockers +
        settlement paths, 409); otherwise soft-deletes + anonymizes, retaining the ledger (BR-3)."""
        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blockers = account_deletion_blockers(request.user)
        if blockers:
            return Response(
                {"code": "deletion_blocked", "message_ar": "لا يمكن حذف الحساب الآن", "blockers": blockers},
                status=status.HTTP_409_CONFLICT,
            )
        delete_account(
            request.user,
            reason=serializer.validated_data["reason"],
            note=serializer.validated_data.get("note", ""),
            ip=_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarMediaView(APIView):
    """GET /api/v1/avatars/<id> — PUBLIC inline avatar image.

    Avatars are public profile data (shown on cards, chat, reviews), so — like PortfolioMediaView —
    this serves the bytes INLINE to anyone, but ONLY when the attachment is hosted by a User (i.e. it
    really is someone's avatar). Never serves any other attachment. This is what makes an uploaded
    avatar renderable in a plain `<img>` (the scoped `/uploads/<id>` endpoint can't be)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        from django.http import FileResponse, Http404  # noqa: PLC0415
        from django.shortcuts import get_object_or_404  # noqa: PLC0415

        from apps.attachments.models import Attachment  # noqa: PLC0415

        att = get_object_or_404(Attachment, pk=pk, is_deleted=False)
        if not isinstance(att.host, User):
            raise Http404
        response = FileResponse(att.file.open("rb"), filename=att.original_name)
        response["Content-Type"] = att.content_type  # inline (no as_attachment) → browser renders it
        return response


class ModeView(APIView):
    """PATCH /api/v1/auth/me/mode — view-toggle preference only (FR-MODE-1/2/4).

    Never gates any API operation; authorization stays relationship-based.
    """

    def patch(self, request):
        serializer = ModeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.active_mode = serializer.validated_data["mode"]
        request.user.save(update_fields=["active_mode"])
        return Response({"active_mode": request.user.active_mode})


class PhoneOTPRequestView(APIView):
    """POST /api/v1/auth/phone/request-otp — send a phone verification code (ppt slide-08)."""

    throttle_scope = "auth"  # SEC-5

    def post(self, request):
        serializer = PhoneOTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(request_phone_otp(request.user, serializer.validated_data["phone"]))


class PhoneOTPVerifyView(APIView):
    """POST /api/v1/auth/phone/verify-otp — confirm the code, mark the phone verified."""

    def post(self, request):
        serializer = PhoneOTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_phone_otp(request.user, serializer.validated_data["code"])
        return Response(MeSerializer(user).data)


class EmailOTPRequestView(APIView):
    """POST /api/v1/auth/email/request-otp — email a one-time login code (FR-AUTH).

    Unauthenticated (sign-in == sign-up). Own ScopedRateThrottle bucket so login is not 429'd by
    unrelated anonymous browsing sharing the per-IP `anon` quota on a NAT/office IP.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        serializer = EmailOTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(request_login_otp(serializer.validated_data["email"], ip=_client_ip(request)))


class EmailOTPVerifyView(APIView):
    """POST /api/v1/auth/email/verify-otp — confirm the code and issue JWTs (FR-AUTH).

    Returns the SAME shape as GoogleLoginView so the frontend handles both methods identically.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        serializer = EmailOTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ip = _client_ip(request)
        try:
            user, created = verify_login_otp(
                serializer.validated_data["email"], serializer.validated_data["code"], ip=ip
            )
        except (PermissionDenied, AuthenticationFailed, ValidationError) as exc:  # FR-AUTH-7
            AuditLog.objects.create(
                actor=None, action="auth.email_otp_failed", ip=ip,
                after={"detail": str(getattr(exc, "detail", exc))[:200]},
            )
            raise
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "first_login": created or not user.active_mode,
                "user": MeSerializer(user).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class EmailChangeRequestView(APIView):
    """POST /api/v1/auth/me/email/request-change — start an email change (ppt slide-31)."""

    throttle_scope = "auth"  # SEC-5

    def post(self, request):
        return Response(request_email_change(request.user, request.data.get("email", "")))


class EmailChangeConfirmView(APIView):
    """POST /api/v1/auth/me/email/confirm — confirm the change with the emailed token."""

    def post(self, request):
        user = confirm_email_change(request.user, request.data.get("token", ""))
        return Response(MeSerializer(user).data)
