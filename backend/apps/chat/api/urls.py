from django.urls import path

from . import views

urlpatterns = [
    path("me/conversations", views.MyConversationsView.as_view(), name="my-conversations"),
    path("conversations", views.StartConversationView.as_view(), name="conversation-start"),
    path("conversations/<int:pk>/messages", views.MessagesView.as_view(), name="conversation-messages"),
    path("conversations/<int:pk>/read", views.MarkReadView.as_view(), name="conversation-read"),
    path("conversations/<int:pk>/report", views.ReportConversationView.as_view(), name="conversation-report"),
    # real-time chat (Firestore): identity token + Firestore→PG sync webhook
    path("chat/token", views.FirebaseTokenView.as_view(), name="chat-token"),
    path("chat/sync", views.FirestoreSyncView.as_view(), name="chat-sync"),
]
