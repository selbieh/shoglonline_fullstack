from rest_framework import serializers

from ..models import InvoiceLine, InvoiceRequest


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = ["id", "contract", "description", "amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    worker_email = serializers.EmailField(source="worker.email", read_only=True)
    employer_email = serializers.EmailField(source="employer.email", read_only=True)

    class Meta:
        model = InvoiceRequest
        fields = ["id", "number", "worker_email", "employer_email", "period_type",
                  "period_start", "period_end", "notes", "total", "status",
                  "reject_reason", "pdf_url", "lines", "created_at", "confirmed_at"]
