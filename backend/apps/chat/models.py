"""1:1 conversations + messages (SRS §4.8 FR-CHAT, §10.4 Firestore mirror).

PostgreSQL is the source of truth; a Firestore mirror is written by the same
transition code (stub in dev). Conversations are strictly between two distinct
users (BR-21) and flip read-only at warranty end / context death (FR-CHAT-7).
"""
from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.db.models import Q


class Conversation(models.Model):
    class Context(models.TextChoices):
        CONTRACT = "contract"
        PROPOSAL = "proposal"
        SERVICE = "service"
        DIRECT = "direct"

    class Status(models.TextChoices):
        ACTIVE = "active"
        READ_ONLY = "read_only"  # warranty ended (BR-10) or context idle/dead (FR-CHAT-7)

    # Stored with a stable ordering (user_a.id < user_b.id) so a pair maps to one row per context.
    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    context_type = models.CharField(max_length=10, choices=Context.choices, default=Context.DIRECT)
    contract = models.ForeignKey("contracts.Contract", null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="conversations")
    job = models.ForeignKey("jobs.Job", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # Set only for SERVICE context: a pre-purchase inquiry chat opened from a service page so a
    # buyer can ask the freelancer questions BEFORE ordering. This is the one path that opens a
    # conversation without an active contract — the contract flow (rule D-2) is untouched.
    service = models.ForeignKey("gigs.Service", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    frozen_prev_status = models.CharField(max_length=10, blank=True, default="")  # restore target on unfreeze (BR-23)
    last_message_snippet = models.CharField(max_length=160, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]
        constraints = [
            models.CheckConstraint(condition=~Q(user_a=models.F("user_b")), name="conversation_no_self"),
            models.UniqueConstraint(fields=["user_a", "user_b", "context_type", "contract", "job"],
                                    name="uniq_conversation_per_context"),
            # A SERVICE inquiry has contract=job=NULL, so the constraint above (NULLs compare
            # distinct in Postgres) can't dedupe it — this partial index gives one inquiry chat per
            # (buyer, freelancer, service) pair and makes get_or_create race-safe.
            models.UniqueConstraint(fields=["user_a", "user_b", "service"],
                                    condition=Q(context_type="service"),
                                    name="uniq_service_conversation"),
        ]

    def has_member(self, user) -> bool:
        return user.id in (self.user_a_id, self.user_b_id)

    def other(self, user):
        return self.user_b if user.id == self.user_a_id else self.user_a


class ConversationMember(models.Model):
    """Per-user read cursor — drives unread counts and the 10-min unread-email rule."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversation_memberships")
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["conversation", "user"], name="uniq_member_per_conversation"),
        ]


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    body = models.TextField(blank=True)
    files = models.JSONField(default=list, blank=True)  # legacy placeholder; real files via attachments
    attachments = GenericRelation("attachments.Attachment", content_type_field="host_type",
                                  object_id_field="object_id")
    unread_email_sent = models.BooleanField(default=False)  # the 10-min checker fires once
    # Firestore message id for client-written messages synced back to PG — dedupes the sync
    # webhook so a Cloud Function retry never double-persists (NULL for backend-originated msgs).
    firestore_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]


class ChatReport(models.Model):
    """Abuse report against a conversation/message (FR-CHAT-10). Reaches an admin review queue
    where the offender can be warned, frozen (BR-23), or the conversation archived."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        DISMISSED = "dismissed", "Dismissed"
        ACTIONED = "actioned", "Actioned"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="reports")
    message = models.ForeignKey(Message, null=True, blank=True, on_delete=models.SET_NULL, related_name="reports")
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    reason = models.CharField(max_length=500)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    resolution = models.CharField(max_length=200, blank=True)  # warned | frozen | archived | dismissed
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self) -> str:
        return f"report #{self.pk} on conversation #{self.conversation_id} ({self.status})"
