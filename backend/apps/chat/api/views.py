from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .. import firebase, services
from ..models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer


def _member_conversation(user, pk) -> Conversation:
    return get_object_or_404(Conversation.objects.filter(Q(user_a=user) | Q(user_b=user)), pk=pk)


class MyConversationsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        u = self.request.user
        return Conversation.objects.filter(Q(user_a=u) | Q(user_b=u)).select_related(
            "user_a", "user_b", "job", "contract", "contract__service", "contract__job",
        )


class StartConversationView(APIView):
    """POST /conversations {contract_id} — rule D-2: chat opens only for an active contract
    between the two parties (proposal-stage chat is no longer supported)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        contract_id = request.data.get("contract_id")
        if not contract_id:
            return Response(
                {"code": "contract_required",
                 "message_ar": "تُفتح المحادثة فقط بعد وجود عقد نشِط بين الطرفين"},
                status=400,
            )
        from apps.contracts.models import Contract
        contract = get_object_or_404(
            Contract.objects.filter(Q(employer=request.user) | Q(worker=request.user)),
            pk=contract_id,
        )
        conv = services.get_or_create_for_contract(contract)
        return Response(ConversationSerializer(conv, context={"request": request}).data, status=201)


class MessagesView(APIView):
    """GET list (marks read) · POST send (rate-limited, FR-CHAT-10)."""

    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        # Only the send path is rate-limited; reads keep the default user throttle.
        if self.request.method == "POST":
            self.throttle_scope = "chat_send"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get(self, request, pk):
        conv = _member_conversation(request.user, pk)
        services.mark_read(conv, request.user)
        msgs = Message.objects.filter(conversation=conv)
        return Response({
            "conversation": ConversationSerializer(conv, context={"request": request}).data,
            "messages": MessageSerializer(msgs, many=True, context={"request": request}).data,
        })

    def post(self, request, pk):
        conv = _member_conversation(request.user, pk)
        msg = services.send_message(conv, request.user,
                                    body=request.data.get("body", ""), files=request.data.get("files") or [],
                                    attachment_ids=request.data.get("attachment_ids") or [])
        return Response(MessageSerializer(msg, context={"request": request}).data, status=201)


class ReportConversationView(APIView):
    """POST /conversations/<id>/report {reason, message_id?} — file an abuse report (FR-CHAT-10)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]  # always rate-limited, independent of the global default
    throttle_scope = "chat_send"

    def post(self, request, pk):
        conv = _member_conversation(request.user, pk)
        report = services.report_conversation(
            conv, request.user,
            reason=request.data.get("reason", ""), message_id=request.data.get("message_id"),
        )
        return Response({"id": report.pk, "status": report.status}, status=201)


class MarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        conv = _member_conversation(request.user, pk)
        services.mark_read(conv, request.user)
        return Response({"id": conv.pk, "unread": 0})


class FirebaseTokenView(APIView):
    """POST /chat/token — mint a per-user Firebase custom token (the client's Firestore identity).

    This is the *control* seam: only an authenticated Django user gets a token, and its uid is
    the user's id, which every security rule keys off. Returns the public web config too so the
    SDK can initialize.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({
            "token": firebase.mint_custom_token(request.user),
            "projectId": settings.FIREBASE_PROJECT_ID,
            "apiKey": settings.FIREBASE_WEB_API_KEY,
            "stub": firebase.is_stub(),
        })


class FirestoreSyncView(APIView):
    """POST /chat/sync — Firestore→Postgres mirror, called by a Cloud Function when a client
    writes a message directly to Firestore. Persists it to PG (for unread-email + oversight)
    idempotently. Authenticated by a shared secret, not a user session.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        from django.utils.crypto import constant_time_compare
        secret = settings.CHAT_SYNC_SECRET
        provided = request.headers.get("X-Chat-Sync-Secret", "")
        # an empty configured secret always denies (never "missing secret allows all");
        # constant_time_compare avoids leaking the secret length/prefix via timing.
        if not secret or not constant_time_compare(provided, secret):
            return Response({"detail": "forbidden"}, status=403)

        from apps.accounts.models import User
        conv = get_object_or_404(Conversation, pk=request.data.get("conversation_id"))
        sender = get_object_or_404(User, pk=request.data.get("sender_id"))
        firestore_id = request.data.get("firestore_id")
        if not firestore_id:
            return Response({"detail": "firestore_id required"}, status=400)

        msg = services.persist_synced_message(
            conv, sender, body=request.data.get("body", ""),
            files=request.data.get("files") or [], firestore_id=str(firestore_id),
            attachment_ids=request.data.get("attachment_ids") or [],
        )
        return Response({"id": msg.pk, "synced": True}, status=201)
