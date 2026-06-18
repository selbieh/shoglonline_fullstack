from django.urls import path

from . import views

urlpatterns = [
    path("me/invoices", views.MyInvoicesView.as_view(), name="my-invoices"),
    path("me/incoming-invoices", views.IncomingInvoicesView.as_view(), name="incoming-invoices-list"),
    path("invoices", views.CreateInvoiceView.as_view(), name="invoice-create"),
    path("invoices/<int:pk>/<str:action>", views.InvoiceActionView.as_view(), name="invoice-action"),
]
