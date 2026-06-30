"""Contracts, submissions, update requests — SRS §4.7 (FR-TASK), §9.4, ERD §10.

State machine (FR-TASK-1, §9.4):
    pending_funding → active → delivered → completed
                   ↘ cancelled        ↘ active (submission rejected)
    active/delivered → disputed → (resume | completed | cancelled) via BR-22

Money invariants (BR-9/24): the agreed budget is held from the employer at funding;
at acceptance it splits exactly into worker_earning + commission (no remainder).
Commission is frozen on the contract at creation (FR-PAY-6).
"""
from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.db.models import Q


class Contract(models.Model):
    class Status(models.TextChoices):
        PENDING_FUNDING = "pending_funding", "Pending funding"
        ACTIVE = "active", "Active"
        DELIVERED = "delivered", "Delivered"
        COMPLETED = "completed", "Completed"
        DISPUTED = "disputed", "Disputed"
        CANCELLED = "cancelled", "Cancelled"

    # Live (money/time-sensitive) statuses for queue filters and BR-2 deletion guard.
    OPEN_STATUSES = (Status.PENDING_FUNDING, Status.ACTIVE, Status.DELIVERED, Status.DISPUTED)

    # Job flow: one accepted proposal → one contract (BR-6, ERD §10.2).
    # Service flow: one accepted buying request → one contract. Exactly one origin is set.
    job = models.OneToOneField("jobs.Job", null=True, blank=True, on_delete=models.PROTECT, related_name="contract")
    proposal = models.OneToOneField("jobs.Proposal", null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="contract")
    service = models.ForeignKey("gigs.Service", null=True, blank=True, on_delete=models.PROTECT,
                                related_name="contracts")
    buying_request = models.OneToOneField("gigs.BuyingRequest", null=True, blank=True, on_delete=models.PROTECT,
                                          related_name="contract")
    employer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="contracts_as_employer"
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="contracts_as_worker"
    )

    title = models.CharField(max_length=160)
    scope = models.TextField(blank=True)
    budget = models.DecimalField(max_digits=12, decimal_places=2)  # agreed amount = escrow hold
    deadline = models.DateField(null=True, blank=True)

    # commission frozen at creation (FR-PAY-6, BR-24)
    commission_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    worker_earning = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING_FUNDING)

    funding_deadline = models.DateTimeField(null=True, blank=True)  # BR-6a auto-cancel
    activated_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    warranty_ends_at = models.DateTimeField(null=True, blank=True)  # BR-10
    funds_released = models.BooleanField(default=False)  # warranty payout posted once

    # cancellation / dispute bookkeeping
    cancel_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cancel_reason = models.CharField(max_length=300, blank=True)
    dispute_ticket_ref = models.CharField(max_length=64, blank=True)
    resolution_note = models.CharField(max_length=300, blank=True)
    overdue_notified_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress wt_earnings.id (data migration).",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["warranty_ends_at"]),
            models.Index(fields=["funding_deadline"]),
        ]
        constraints = [
            # BR-21: an account can never hold both sides of a contract.
            models.CheckConstraint(condition=~Q(worker=models.F("employer")), name="contract_no_self_dealing"),
        ]

    def __str__(self) -> str:
        return f"contract #{self.pk} ({self.status})"

    def is_party(self, user) -> bool:
        return user.id in (self.employer_id, self.worker_id)


class Submission(models.Model):
    """Worker deliverables (FR-TASK-3). Multiple allowed; each timestamped."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="submissions")
    notes = models.TextField(blank=True)
    files = models.JSONField(default=list, blank=True)  # legacy placeholder; real files via attachments
    attachments = GenericRelation("attachments.Attachment", content_type_field="host_type",
                                  object_id_field="object_id")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    reject_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress wt-milestone post ID (data migration).",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"submission #{self.pk} on contract #{self.contract_id}"


class UpdateRequest(models.Model):
    """Mid-flight term changes (FR-TASK-5): budget and/or deadline."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PENDING_FUNDING = "pending_funding", "Pending funding"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="update_requests")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    new_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    new_deadline = models.DateField(null=True, blank=True)
    message = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    reject_reason = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"update-request #{self.pk} on contract #{self.contract_id}"


class ContractEvent(models.Model):
    """Audit trail of contract transitions (FR-TASK-7). Notifications fan out from here."""

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=40)  # created|funded|delivered|accepted|rejected|updated|disputed|cancelled|overdue|released
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    detail = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.kind} @ contract #{self.contract_id}"
