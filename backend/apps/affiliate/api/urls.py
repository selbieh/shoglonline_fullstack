from django.urls import path

from . import views

urlpatterns = [
    path("me/affiliate", views.MyAffiliateView.as_view(), name="my-affiliate"),
    path("me/affiliate/stats", views.AffiliateStatsView.as_view(), name="affiliate-stats"),
    path("me/affiliate/slug", views.AffiliateSlugView.as_view(), name="affiliate-slug"),
    path("me/affiliate/referrals", views.MyReferralsView.as_view(), name="my-referrals"),
    path("affiliate/attribute", views.AttributeView.as_view(), name="affiliate-attribute"),
    path("affiliate/click", views.AffiliateClickView.as_view(), name="affiliate-click"),
]
