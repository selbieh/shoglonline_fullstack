from django.urls import path

from . import views

urlpatterns = [
    path("me/wallet", views.MyWalletView.as_view(), name="my-wallet"),
    path("me/transactions", views.MyTransactionsView.as_view(), name="my-transactions"),
    path("wallet/charge", views.ChargeView.as_view(), name="wallet-charge"),
    path("wallet/charge/confirm", views.ChargeConfirmView.as_view(), name="wallet-charge-confirm"),
    path("me/withdrawals", views.MyWithdrawalsView.as_view(), name="my-withdrawals"),
    path("me/payment-methods", views.MyPaymentMethodsView.as_view(), name="my-payment-methods"),
    path("me/payment-methods/<int:pk>", views.PaymentMethodDetailView.as_view(), name="payment-method-detail"),
    path("bid-plans/<int:pk>/purchase", views.PurchaseBidPlanView.as_view(), name="bid-plan-purchase"),
]
