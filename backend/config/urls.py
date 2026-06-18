from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    path("auth/", include("apps.accounts.api.urls")),
    path("", include("apps.profiles.api.urls")),
    path("", include("apps.catalog.api.urls")),
    path("", include("apps.core.api.urls")),
    path("", include("apps.jobs.api.urls")),
    path("", include("apps.bids.api.urls")),
    path("", include("apps.subscriptions.api.urls")),
    path("", include("apps.payments.api.urls")),
    path("", include("apps.contracts.api.urls")),
    path("", include("apps.notifications.api.urls")),
    path("", include("apps.chat.api.urls")),
    path("", include("apps.reviews.api.urls")),
    path("", include("apps.tickets.api.urls")),
    path("", include("apps.gigs.api.urls")),
    path("", include("apps.invoices.api.urls")),
    path("", include("apps.affiliate.api.urls")),
    path("", include("apps.cms.api.urls")),
    path("", include("apps.attachments.api.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
