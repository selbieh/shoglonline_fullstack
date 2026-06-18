from django.urls import path

from .views import CategoryListView, SkillListView

urlpatterns = [
    path("categories", CategoryListView.as_view(), name="categories"),
    path("skills", SkillListView.as_view(), name="skills"),
]
