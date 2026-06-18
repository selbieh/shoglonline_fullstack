from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Notification
from .serializers import NotificationPreferenceSerializer, NotificationSerializer


class MyNotificationsView(ListAPIView):
    """GET /me/notifications (?unread=1)."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread"):
            qs = qs.filter(read_at__isnull=True)
        return qs


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"unread": services.unread_count(request.user)})


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        note = get_object_or_404(Notification, pk=pk, user=request.user)
        if note.read_at is None:
            note.read_at = timezone.now()
            note.save(update_fields=["read_at"])
        return Response({"id": note.pk, "is_read": True})


class MarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread": 0})


class MyNotificationPreferenceView(APIView):
    """GET/PUT /me/notification-preferences — per-category opt-in/out (FR-PROF-9)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref = services.get_or_create_preference(request.user)
        return Response(NotificationPreferenceSerializer(pref).data)

    def put(self, request):
        pref = services.get_or_create_preference(request.user)
        serializer = NotificationPreferenceSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
