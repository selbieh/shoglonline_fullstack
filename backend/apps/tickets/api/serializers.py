from rest_framework import serializers

from ..models import Ticket, TicketReply, TicketType


class TicketTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketType
        fields = ["id", "name_ar", "slug", "is_dispute"]


class TicketReplySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketReply
        fields = ["id", "message", "is_staff", "author", "created_at"]


class TicketListSerializer(serializers.ModelSerializer):
    type_name = serializers.CharField(source="type.name_ar", read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "title", "status", "type_name", "contract", "job", "created_at", "last_activity_at"]


class TicketDetailSerializer(TicketListSerializer):
    replies = TicketReplySerializer(many=True, read_only=True)

    class Meta(TicketListSerializer.Meta):
        fields = TicketListSerializer.Meta.fields + ["message", "resolution_report", "replies"]
