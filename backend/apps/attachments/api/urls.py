from django.urls import path

from . import views

urlpatterns = [
    path("uploads", views.UploadView.as_view(), name="upload"),
    path("uploads/<int:pk>", views.AttachmentDownloadView.as_view(), name="attachment-download"),
]
