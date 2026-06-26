"""Period invoices (SRS FR-PAY-7). A worker requests an invoice for their completed
contracts with one employer over a period; the employer confirms and the platform
generates the PDF. InvoiceRequest links worker, period, and the contract set (§10)."""
from django.conf import settings
from django.db import models


class InvoiceRequest(models.Model):
    class Period(models.TextChoices):
        WEEK = "week", "Week"
        MONTH = "month", "Month"

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        CONFIRMED = "confirmed", "Confirmed"
        REJECTED = "rejected", "Rejected"

    number = models.CharField(max_length=32, unique=True, blank=True)
    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invoice_requests")
    employer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="incoming_invoices")
    period_type = models.CharField(max_length=6, choices=Period.choices, default=Period.MONTH)
    period_start = models.DateField()
    period_end = models.DateField()
    notes = models.CharField(max_length=300, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED)
    reject_reason = models.CharField(max_length=300, blank=True)
    pdf_url = models.CharField(max_length=300, blank=True)  # generated on confirm
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.number or f"invoice #{self.pk}"


class InvoiceLine(models.Model):
    invoice = models.ForeignKey(InvoiceRequest, on_delete=models.CASCADE, related_name="lines")
    contract = models.ForeignKey("contracts.Contract", on_delete=models.PROTECT, related_name="invoice_lines")
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # worker earning for that contract
