from django.urls import path

from .views import AdminStatsView, PublicSettingsView

urlpatterns = [
    path("settings/public", PublicSettingsView.as_view(), name="public-settings"),
    path("admin/stats", AdminStatsView.as_view(), name="admin-stats"),
]
