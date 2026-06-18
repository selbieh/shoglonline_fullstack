from django.urls import path

from .views import (
    MyIDVerificationView,
    MyWorkerProfileView,
    PublicWorkerDetailView,
    PublicWorkerListView,
)

urlpatterns = [
    path("freelancers", PublicWorkerListView.as_view(), name="freelancers"),
    path("freelancers/<int:pk>", PublicWorkerDetailView.as_view(), name="freelancer-detail"),
    path("me/profile", MyWorkerProfileView.as_view(), name="my-profile"),
    path("me/id-verification", MyIDVerificationView.as_view(), name="my-id-verification"),
]
