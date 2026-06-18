from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Attachment
from .serializers import AttachmentSerializer


class UploadView(APIView):
    """POST /uploads (multipart) — validate + store, returns the attachment to link on host create."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "uploads"  # SEC: cap upload flooding

    def post(self, request):
        attachment = services.create_attachment(request.user, request.FILES.get("file"))
        return Response(AttachmentSerializer(attachment, context={"request": request}).data, status=201)


class AttachmentDownloadView(APIView):
    """GET /uploads/{id} — scoped download: owner OR a party of the linked host only.

    Returns 404 (not 403) when the caller may not access it, so the file's existence stays hidden
    from non-parties. For S3 in prod this can be optimized to a signed-URL redirect; streaming via
    FileResponse keeps the access check universal across storage backends.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        attachment = get_object_or_404(Attachment, pk=pk, is_deleted=False)
        if not services.can_access(attachment, request.user):
            raise Http404  # existence hidden from non-parties
        return FileResponse(
            attachment.file.open("rb"), as_attachment=True, filename=attachment.original_name,
        )
