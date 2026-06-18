from rest_framework import serializers

from ..models import Review


class ReviewSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "contract", "rating", "comment", "author", "author_name",
                  "subject", "mine", "is_locked", "created_at"]
        read_only_fields = ["contract", "author", "subject", "is_locked"]

    def _user(self):
        req = self.context.get("request")
        return req.user if req else None

    def get_author_name(self, obj) -> str:
        a = obj.author
        return (f"{a.first_name} {a.last_name}".strip() or a.email)

    def get_mine(self, obj) -> bool:
        u = self._user()
        return bool(u and obj.author_id == u.id)
