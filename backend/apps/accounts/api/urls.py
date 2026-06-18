from django.urls import path

from .views import AuditedTokenRefreshView, GoogleLoginView, LogoutView, MeView, ModeView

urlpatterns = [
    path("google", GoogleLoginView.as_view(), name="auth-google"),
    path("refresh", AuditedTokenRefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("me/mode", ModeView.as_view(), name="auth-mode"),
]
