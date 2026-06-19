from rest_framework import serializers

from apps.attachments.api.serializers import AttachmentSerializer

from .. import services
from ..models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "body", "files", "attachments", "sender", "mine", "created_at"]

    def get_mine(self, obj) -> bool:
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and obj.sender_id == user.id)

    def get_attachments(self, obj):
        rows = obj.attachments.filter(is_deleted=False)
        return AttachmentSerializer(rows, many=True, context=self.context).data


class ConversationSerializer(serializers.ModelSerializer):
    other = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()
    read_only = serializers.SerializerMethodField()
    context = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "context_type", "status", "read_only", "other", "unread",
                  "context", "last_message_snippet", "last_message_at", "created_at"]

    def get_other(self, obj) -> dict:
        user = self.context["request"].user
        o = obj.other(user)
        return {
            "id": o.id,
            "name": (f"{o.first_name} {o.last_name}".strip() or o.email),
            "email": o.email,
            "avatar": getattr(o, "avatar_url", "") or "",
        }

    def get_unread(self, obj) -> int:
        return services.unread_count(obj, self.context["request"].user)

    def get_read_only(self, obj) -> bool:
        return obj.status == Conversation.Status.READ_ONLY

    def get_context(self, obj):
        """Header deep-link to the originating service/job/contract — powers «عرض الخدمة»
        (and «عرض الوظيفة» / «عرض العقد»). Returns None for plain/direct conversations."""
        if obj.context_type == Conversation.Context.PROPOSAL and obj.job_id:
            return {"label": "عرض الوظيفة", "title": obj.job.title, "href": f"/jobs/{obj.job.slug}"}
        if obj.context_type == Conversation.Context.CONTRACT and obj.contract_id:
            c = obj.contract
            if c.service_id:
                return {"label": "عرض الخدمة", "title": c.service.title, "href": f"/services/{c.service.slug}"}
            if c.job_id:
                return {"label": "عرض الوظيفة", "title": c.job.title, "href": f"/jobs/{c.job.slug}"}
            return {"label": "عرض العقد", "title": c.title, "href": f"/contracts/{c.id}"}
        return None
