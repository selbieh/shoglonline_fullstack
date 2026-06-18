from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import AffiliateCommission, Referral


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


class MyAffiliateView(APIView):
    """GET /me/affiliate — referral link, share buttons, earnings + funnel stats (FR-AFF)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        services.get_or_create_profile(request.user)
        return Response({**services.earnings_summary(request.user), **services.stats(request.user)})


class AffiliateStatsView(APIView):
    """GET /me/affiliate/stats — clicks / registrations / transactions / earnings (FR-AFF)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(services.stats(request.user))


class AffiliateSlugView(APIView):
    """PATCH /me/affiliate/slug {slug} — set a custom, unique referral slug (FR-AFF-3)."""

    permission_classes = [IsAuthenticated]
    http_method_names = ["patch"]

    def patch(self, request):
        profile = services.update_slug(request.user, request.data.get("slug", ""))
        return Response({"slug": profile.slug, "referral_link": services.referral_link(profile.slug),
                         "share": services.share_urls(profile.slug)})


class AffiliateClickView(APIView):
    """POST /affiliate/click {slug} — record a referral-link visit (public, FR-AFF-1)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        slug = (request.data.get("slug") or "").strip().lower()
        click = services.record_click(slug, ip=_client_ip(request),
                                      user_agent=request.META.get("HTTP_USER_AGENT", ""))
        resp = Response({"recorded": bool(click), "slug": slug if click else ""})
        if click is not None:  # also drop a cookie for same-domain attribution at signup
            from apps.core.services import get_setting
            resp.set_cookie("aff_ref", slug, max_age=int(get_setting("affiliate.cookie_days", 30)) * 86400,
                            samesite="Lax")
        return resp


class AttributeView(APIView):
    """POST /affiliate/attribute {slug} — bind the caller to a referrer (once)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        slug = (request.data.get("slug") or request.COOKIES.get("aff_ref") or "").strip()
        referral = services.attribute(request.user, slug)
        return Response({"attributed": bool(referral)}, status=200)


class MyReferralsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        referrals = Referral.objects.filter(referrer=request.user).select_related("referred_user")
        commissions = AffiliateCommission.objects.filter(referrer=request.user)
        return Response({
            "referrals": [
                {"email": r.referred_user.email, "since": r.created_at, "window_end": r.earning_window_end}
                for r in referrals
            ],
            "commissions": [
                {"contract": c.contract_id, "amount": c.amount, "status": c.status, "at": c.created_at}
                for c in commissions
            ],
        })
