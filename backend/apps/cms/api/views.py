from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ContentPage, FAQItem, LandingCard, LandingSection, SiteSettings


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentPage
        fields = ["slug", "title", "body", "meta_title", "meta_description", "updated_at"]


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQItem
        fields = ["id", "question", "answer", "category", "order"]


class PageListView(ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = PageSerializer
    queryset = ContentPage.objects.filter(is_published=True)


class PageDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, slug):
        page = get_object_or_404(ContentPage, slug=slug, is_published=True)
        return Response(PageSerializer(page).data)


class FAQListView(ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = FAQSerializer
    filterset_fields = ["category"]
    queryset = FAQItem.objects.filter(is_published=True)


class LandingCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandingCard
        fields = ["icon", "title", "subtitle", "link", "image_url"]


class LandingSectionSerializer(serializers.ModelSerializer):
    cards = serializers.SerializerMethodField()

    class Meta:
        model = LandingSection
        fields = ["key", "kind", "heading", "subheading", "cta_primary_label",
                  "cta_primary_link", "cta_secondary_label", "cta_secondary_link", "cards"]

    def get_cards(self, obj):
        return LandingCardSerializer(obj.cards.filter(is_active=True), many=True).data


class LandingView(APIView):
    """GET /api/v1/landing — admin-controlled home-page sections (FR-CMS)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        sections = (LandingSection.objects.filter(is_active=True)
                    .prefetch_related("cards"))
        return Response({"sections": LandingSectionSerializer(sections, many=True).data})


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = ["contact_email", "contact_phone", "contact_address",
                  "app_store_url", "google_play_url",
                  "facebook_url", "twitter_url", "instagram_url", "youtube_url", "linkedin_url"]


class SiteSettingsView(APIView):
    """GET /api/v1/site-settings — admin-controlled footer contact / app / social links (FR-CMS).

    Blank fields are returned as "" so the frontend can hide that line/icon/badge.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)
