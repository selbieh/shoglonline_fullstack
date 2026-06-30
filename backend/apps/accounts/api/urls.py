from django.urls import path

from .views import (
    AuditedTokenRefreshView,
    AvatarMediaView,
    EmailChangeConfirmView,
    EmailChangeRequestView,
    EmailOTPRequestView,
    EmailOTPVerifyView,
    GoogleLoginView,
    LogoutView,
    MeView,
    ModeView,
    PhoneOTPRequestView,
    PhoneOTPVerifyView,
)

urlpatterns = [
    path("avatars/<int:pk>", AvatarMediaView.as_view(), name="avatar-media"),
    path("google", GoogleLoginView.as_view(), name="auth-google"),
    path("refresh", AuditedTokenRefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("me/mode", ModeView.as_view(), name="auth-mode"),
    path("email/request-otp", EmailOTPRequestView.as_view(), name="auth-email-request-otp"),
    path("email/verify-otp", EmailOTPVerifyView.as_view(), name="auth-email-verify-otp"),
    path("phone/request-otp", PhoneOTPRequestView.as_view(), name="auth-phone-request-otp"),
    path("phone/verify-otp", PhoneOTPVerifyView.as_view(), name="auth-phone-verify-otp"),
    path("me/email/request-change", EmailChangeRequestView.as_view(), name="auth-email-request-change"),
    path("me/email/confirm", EmailChangeConfirmView.as_view(), name="auth-email-confirm"),
]
