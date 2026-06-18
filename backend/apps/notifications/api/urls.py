from django.urls import path

from . import views

urlpatterns = [
    path("me/notifications", views.MyNotificationsView.as_view(), name="my-notifications"),
    path("me/notifications/unread-count", views.UnreadCountView.as_view(), name="notifications-unread"),
    path("me/notifications/read-all", views.MarkAllReadView.as_view(), name="notifications-read-all"),
    path("me/notification-preferences", views.MyNotificationPreferenceView.as_view(), name="notification-prefs"),
    path("notifications/<int:pk>/read", views.MarkReadView.as_view(), name="notification-read"),
]
