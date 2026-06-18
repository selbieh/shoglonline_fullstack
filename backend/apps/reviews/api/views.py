from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contracts.models import Contract

from .. import services
from ..models import Review
from .serializers import ReviewSerializer


class ContractReviewsView(APIView):
    """GET both reviews (parties only) · POST leave a review (FR-REV-1)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        contract = get_object_or_404(
            Contract.objects.filter(Q(employer=request.user) | Q(worker=request.user)), pk=pk
        )
        reviews = contract.reviews.all()
        return Response(ReviewSerializer(reviews, many=True, context={"request": request}).data)

    def post(self, request, pk):
        contract = get_object_or_404(
            Contract.objects.filter(Q(employer=request.user) | Q(worker=request.user)), pk=pk
        )
        review = services.leave_review(
            contract, request.user,
            rating=request.data.get("rating", 0), comment=request.data.get("comment", ""),
        )
        return Response(ReviewSerializer(review, context={"request": request}).data, status=201)


class ReviewDetailView(APIView):
    """PATCH /reviews/{id} — edit within warranty (FR-REV-2)."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        review = get_object_or_404(Review, pk=pk, author=request.user)
        services.edit_review(
            review, request.user,
            rating=request.data.get("rating", review.rating), comment=request.data.get("comment", review.comment),
        )
        return Response(ReviewSerializer(review, context={"request": request}).data)


class UserReviewsView(APIView):
    """GET /users/{id}/reviews — public profile reviews + aggregate (AC-7)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, user_id):
        reviews = Review.objects.filter(subject_id=user_id).select_related("author")
        return Response({
            "summary": services.rating_summary_for(user_id),
            "reviews": ReviewSerializer(reviews, many=True, context={"request": request}).data,
        })
