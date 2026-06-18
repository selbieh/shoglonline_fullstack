from django.urls import path

from .views import BidPlansView, MyBidsHistoryView, MyBidsView

urlpatterns = [
    path("bid-plans", BidPlansView.as_view(), name="bid-plans"),
    path("me/bids", MyBidsView.as_view(), name="my-bids"),
    path("me/bids/history", MyBidsHistoryView.as_view(), name="my-bids-history"),
]
