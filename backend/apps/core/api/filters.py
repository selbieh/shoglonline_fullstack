"""Shared DRF filter backends."""
from rest_framework.filters import OrderingFilter


class StableOrderingFilter(OrderingFilter):
    """OrderingFilter that always appends a deterministic primary-key tiebreaker.

    Plain ``OrderingFilter`` runs ``queryset.order_by(*ordering)``, which *replaces* the model's
    ``Meta.ordering`` — dropping its secondary sort. When the chosen field has duplicate values
    (e.g. many jobs sharing the same ``published_at`` after a bulk admin-approval or seed import),
    the database returns the tied rows in an arbitrary order. The symptoms: "newest" looks wrong,
    and — because limit/offset pagination re-evaluates the order on every page — rows shuffle
    between pages, so "load more" silently duplicates and skips items.

    Appending the primary key guarantees a total, stable order across the whole result set.
    """

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if ordering:
            ordering = list(ordering)
            if not any(field.lstrip("-") == "pk" for field in ordering):
                # match the primary sort's direction so the tiebreaker reads naturally (newest pk first)
                ordering.append("-pk" if ordering[0].startswith("-") else "pk")
            return queryset.order_by(*ordering)
        return queryset
