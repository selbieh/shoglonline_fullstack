from rest_framework import serializers

from ..models import Contract, ContractEvent, Submission, UpdateRequest


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ["id", "notes", "files", "status", "reject_reason", "created_at", "decided_at"]
        read_only_fields = ["status", "reject_reason", "decided_at", "created_at"]


class UpdateRequestSerializer(serializers.ModelSerializer):
    requested_by_me = serializers.SerializerMethodField()

    class Meta:
        model = UpdateRequest
        fields = ["id", "new_budget", "new_deadline", "message", "status", "reject_reason",
                  "requested_by", "requested_by_me", "created_at", "decided_at"]
        read_only_fields = ["status", "reject_reason", "requested_by", "decided_at", "created_at"]

    def get_requested_by_me(self, obj) -> bool:
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and obj.requested_by_id == user.id)


class ContractEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractEvent
        fields = ["id", "kind", "detail", "created_at"]


class ContractListSerializer(serializers.ModelSerializer):
    my_role = serializers.SerializerMethodField()
    counterpart = serializers.SerializerMethodField()

    class Meta:
        model = Contract
        fields = ["id", "title", "budget", "status", "deadline", "my_role", "counterpart",
                  "funding_deadline", "warranty_ends_at", "created_at"]

    def get_my_role(self, obj) -> str:
        user = self.context["request"].user
        return "employer" if obj.employer_id == user.id else "worker"

    def get_counterpart(self, obj) -> dict:
        user = self.context["request"].user
        other = obj.worker if obj.employer_id == user.id else obj.employer
        return {"id": other.id, "email": other.email,
                "name": (f"{other.first_name} {other.last_name}".strip() or other.email)}


class ContractDetailSerializer(ContractListSerializer):
    submissions = SubmissionSerializer(many=True, read_only=True)
    update_requests = UpdateRequestSerializer(many=True, read_only=True)
    events = ContractEventSerializer(many=True, read_only=True)
    cancel_requested_by_me = serializers.SerializerMethodField()
    cancel_pending = serializers.SerializerMethodField()

    class Meta(ContractListSerializer.Meta):
        fields = ContractListSerializer.Meta.fields + [
            "scope", "commission_pct", "commission_amount", "worker_earning",
            "resolution_note", "cancel_reason", "cancel_requested_by_me", "cancel_pending",
            "submissions", "update_requests", "events",
        ]

    def get_cancel_requested_by_me(self, obj) -> bool:
        user = self.context["request"].user
        return obj.cancel_requested_by_id == user.id

    def get_cancel_pending(self, obj) -> bool:
        return obj.cancel_requested_by_id is not None and obj.status in (
            Contract.Status.ACTIVE, Contract.Status.DELIVERED
        )
