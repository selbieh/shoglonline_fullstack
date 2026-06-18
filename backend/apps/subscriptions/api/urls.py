from django.urls import path

from .views import MySubscriptionsView

urlpatterns = [
    path("me/category-subscriptions", MySubscriptionsView.as_view(), name="my-subscriptions"),
]
