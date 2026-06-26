from django.urls import path

from . import views

urlpatterns = [
    path("pages", views.PageListView.as_view(), name="pages"),
    path("pages/<slug:slug>", views.PageDetailView.as_view(), name="page-detail"),
    path("faqs", views.FAQListView.as_view(), name="faqs"),
    path("landing", views.LandingView.as_view(), name="landing"),
    path("site-settings", views.SiteSettingsView.as_view(), name="site-settings"),
]
