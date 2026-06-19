from django.urls import path

from . import views

urlpatterns = [
    # public discovery
    path("services", views.PublicServiceListView.as_view(), name="services"),
    path("services/<str:slug>", views.PublicServiceDetailView.as_view(), name="service-detail"),
    # worker management
    path("me/services", views.MyServicesView.as_view(), name="my-services"),
    path("me/services/<int:pk>", views.MyServiceDetailView.as_view(), name="my-service-detail"),
    path("me/services/<int:pk>/<str:action>", views.ServiceActionView.as_view(), name="service-action"),
    # favourites
    path("me/favorites", views.FavoritesView.as_view(), name="service-favorites"),
    path("me/favorites/<int:service_id>", views.FavoritesView.as_view(), name="service-favorite-item"),
    path("me/favorites/<str:kind>/<int:object_id>", views.GenericFavoriteView.as_view(), name="favorite-generic"),
    # buying requests
    path("services/<int:pk>/requests", views.RequestServiceView.as_view(), name="service-request"),
    path("me/requests", views.MyRequestsView.as_view(), name="my-requests"),
    path("me/service-requests", views.IncomingRequestsView.as_view(), name="incoming-requests"),
    path("requests/<int:pk>/<str:action>", views.RequestActionView.as_view(), name="request-action"),
]
