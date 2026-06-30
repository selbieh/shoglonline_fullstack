from django.urls import path

from .views import (
    MyCertificateItemView,
    MyCertificatesView,
    MyEmployerProfileView,
    MyIDVerificationView,
    MyPortfolioItemView,
    MyPortfolioView,
    MyWorkerProfilePreviewView,
    MyWorkerProfileView,
    PortfolioMediaView,
    PublicPortfolioItemView,
    PublicPortfolioListView,
    PublicWorkerDetailView,
    PublicWorkerListView,
    PublishProfileView,
)

urlpatterns = [
    path("freelancers", PublicWorkerListView.as_view(), name="freelancers"),
    # string segments — declared before the <int:pk> detail route to keep intent explicit
    path("freelancers/portfolio", PublicPortfolioListView.as_view(), name="public-portfolio-list"),
    path("freelancers/portfolio-media/<int:pk>", PortfolioMediaView.as_view(), name="portfolio-media"),
    path("freelancers/portfolio/<int:pk>", PublicPortfolioItemView.as_view(), name="public-portfolio-item"),
    path("freelancers/<int:pk>", PublicWorkerDetailView.as_view(), name="freelancer-detail"),
    path("me/profile", MyWorkerProfileView.as_view(), name="my-profile"),
    path("me/profile/preview", MyWorkerProfilePreviewView.as_view(), name="my-profile-preview"),
    path("me/profile/publish", PublishProfileView.as_view(), name="my-profile-publish"),
    path("me/employer-profile", MyEmployerProfileView.as_view(), name="my-employer-profile"),
    path("me/portfolio", MyPortfolioView.as_view(), name="my-portfolio"),
    path("me/portfolio/<int:pk>", MyPortfolioItemView.as_view(), name="my-portfolio-item"),
    path("me/certificates", MyCertificatesView.as_view(), name="my-certificates"),
    path("me/certificates/<int:pk>", MyCertificateItemView.as_view(), name="my-certificate-item"),
    path("me/id-verification", MyIDVerificationView.as_view(), name="my-id-verification"),
]
