from django.urls import path

from . import views

urlpatterns = [
    # public
    path("jobs", views.PublicJobListView.as_view(), name="jobs"),
    # <str:> (not <slug:>) so unicode/Arabic slugs resolve — Job.slug is allow_unicode=True
    # and the SlugConverter regex is ASCII-only. Mirrors services/<str:slug>. (FR-JOB-3 SEO)
    path("jobs/<str:slug>", views.PublicJobDetailView.as_view(), name="job-detail"),
    # employer
    path("me/jobs", views.MyJobsView.as_view(), name="my-jobs"),
    path("me/jobs/<int:pk>", views.MyJobDetailView.as_view(), name="my-job-detail"),
    path("me/jobs/<int:pk>/close", views.CloseJobView.as_view(), name="job-close"),
    path("me/jobs/<int:pk>/repost", views.RepostJobView.as_view(), name="job-repost"),
    path("me/rehire", views.RehireWorkerView.as_view(), name="worker-rehire"),
    path("me/jobs/<int:pk>/proposals", views.JobProposalsView.as_view(), name="job-proposals"),
    path("me/jobs/<int:pk>/invitations", views.InviteWorkerView.as_view(), name="job-invite"),
    path("me/sent-invitations", views.SentInvitationsView.as_view(), name="my-sent-invitations"),
    # worker
    path("jobs/<int:pk>/proposals", views.SubmitProposalView.as_view(), name="submit-proposal"),
    path("me/proposals", views.MyProposalsView.as_view(), name="my-proposals"),
    path("proposals/<int:pk>/cancel", views.CancelProposalView.as_view(), name="proposal-cancel"),
    path("proposals/<int:pk>/rate", views.RateProposalView.as_view(), name="proposal-rate"),
    path("proposals/<int:pk>/accept", views.AcceptProposalView.as_view(), name="proposal-accept"),
    path("proposals/<int:pk>/reject", views.RejectProposalView.as_view(), name="proposal-reject"),
    path("me/invitations", views.MyInvitationsView.as_view(), name="my-invitations"),
    path("invitations/<int:pk>/reject", views.RejectInvitationView.as_view(), name="invitation-reject"),
    # watchlist
    path("me/watchlist", views.WatchlistView.as_view(), name="watchlist"),
    path("me/watchlist/<int:job_id>", views.WatchlistView.as_view(), name="watchlist-item"),
]
