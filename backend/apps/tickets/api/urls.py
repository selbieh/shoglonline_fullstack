from django.urls import path

from . import views

urlpatterns = [
    path("ticket-types", views.TicketTypesView.as_view(), name="ticket-types"),
    path("me/tickets", views.MyTicketsView.as_view(), name="my-tickets"),
    path("tickets", views.CreateTicketView.as_view(), name="ticket-create"),
    path("tickets/<int:pk>", views.TicketDetailView.as_view(), name="ticket-detail"),
    path("tickets/<int:pk>/replies", views.TicketReplyView.as_view(), name="ticket-reply"),
]
