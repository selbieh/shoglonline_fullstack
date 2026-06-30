"""Support tickets with a full status machine (SRS FR-TKT, §9.6, AC-9).

A ticket may link a job or contract. Dispute-type tickets raised against a
contract flag it Disputed (BR-22 coupling); such a ticket cannot be closed until
the contract's dispute is resolved. Closed tickets are read-only.
"""
from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models


class TicketType(models.Model):
    """Admin-managed ticket categories (ADM-6)."""

    name_ar = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    is_dispute = models.BooleanField(default=False, help_text="Couples to a contract dispute (BR-22)")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_ar"]

    def __str__(self) -> str:
        return self.name_ar


class Ticket(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ANSWERED = "answered", "Answered"        # staff replied, awaiting the user
        PENDING = "pending", "Pending"           # awaiting external/3rd-party input
        ON_HOLD = "on_hold", "On-Hold"           # paused by staff (mandatory reason) — BR-14
        SOLVED = "solved", "Solved"
        CLOSED = "closed", "Closed"

    # "in flight" statuses eligible for idle auto-solve — On-Hold is deliberately excluded
    # (a held ticket stays held until staff resume it).
    OPEN_STATUSES = (Status.OPEN, Status.ANSWERED, Status.PENDING)

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    type = models.ForeignKey(TicketType, on_delete=models.PROTECT, related_name="tickets")
    title = models.CharField(max_length=160)
    message = models.TextField()
    attachments = GenericRelation("attachments.Attachment", content_type_field="host_type",
                                  object_id_field="object_id")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    on_hold_reason = models.CharField(max_length=300, blank=True)  # mandatory when On-Hold (BR-14)
    on_hold_at = models.DateTimeField(null=True, blank=True)
    job = models.ForeignKey("jobs.Job", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    contract = models.ForeignKey("contracts.Contract", null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="tickets")
    resolution_report = models.TextField(blank=True)
    last_activity_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    solved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress emd_ticket post ID (data migration).",
    )

    class Meta:
        ordering = ["-last_activity_at"]
        indexes = [models.Index(fields=["status", "-last_activity_at"])]

    def __str__(self) -> str:
        return f"#{self.pk} {self.title}"


class TicketReply(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="replies")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    message = models.TextField()
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
