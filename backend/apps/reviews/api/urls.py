from django.urls import path

from . import views

urlpatterns = [
    path("contracts/<int:pk>/reviews", views.ContractReviewsView.as_view(), name="contract-reviews"),
    path("reviews/<int:pk>", views.ReviewDetailView.as_view(), name="review-detail"),
    path("users/<int:user_id>/reviews", views.UserReviewsView.as_view(), name="user-reviews"),
]
