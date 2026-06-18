from django.urls import path

from . import views

urlpatterns = [
    path("me/contracts", views.MyContractsView.as_view(), name="my-contracts"),
    path("contracts/<int:pk>", views.ContractDetailView.as_view(), name="contract-detail"),
    path("contracts/<int:pk>/fund", views.FundContractView.as_view(), name="contract-fund"),
    path("contracts/<int:pk>/submissions", views.SubmissionsView.as_view(), name="contract-submissions"),
    path("contracts/<int:pk>/update-requests", views.UpdateRequestsView.as_view(), name="contract-update-requests"),
    path("contracts/<int:pk>/cancel", views.RequestCancelView.as_view(), name="contract-cancel"),
    path("contracts/<int:pk>/cancel/confirm", views.ConfirmCancelView.as_view(), name="contract-cancel-confirm"),
    path("contracts/<int:pk>/dispute", views.OpenDisputeView.as_view(), name="contract-dispute"),
    path("submissions/<int:pk>/accept", views.AcceptSubmissionView.as_view(), name="submission-accept"),
    path("submissions/<int:pk>/reject", views.RejectSubmissionView.as_view(), name="submission-reject"),
    path("update-requests/<int:pk>/respond", views.RespondUpdateView.as_view(), name="update-request-respond"),
]
