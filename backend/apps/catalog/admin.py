from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Category, Skill


@admin.register(Category)
class CategoryAdmin(ModelAdmin):
    list_display = ("icon", "name_ar", "name_en", "slug", "parent", "is_active", "order")
    list_display_links = ("name_ar",)
    list_editable = ("icon", "order", "is_active")  # pick the icon from the dropdown inline
    list_filter = ("is_active", "parent")
    search_fields = ("name_ar", "name_en", "slug")
    autocomplete_fields = ("parent",)
    prepopulated_fields = {"slug": ("name_ar",)}
    fields = ("name_ar", "name_en", "slug", "parent", "icon", "description", "is_active", "order")


@admin.register(Skill)
class SkillAdmin(ModelAdmin):
    list_display = ("name_ar", "slug", "subcategory", "is_active")
    list_filter = ("is_active", "subcategory")
    search_fields = ("name_ar", "slug")
    autocomplete_fields = ("subcategory",)
    list_select_related = ("subcategory",)
