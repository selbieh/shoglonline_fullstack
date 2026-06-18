"""Limit/offset pagination (DRF standard) for every listing endpoint.

Response envelope stays {count, next, previous, results}; clients page with ?limit=&offset=.
`default_limit` keeps existing callers (no params) working; `max_limit` caps abuse.
"""
from rest_framework.pagination import LimitOffsetPagination


class StandardLimitOffsetPagination(LimitOffsetPagination):
    default_limit = 20
    max_limit = 100
    limit_query_param = "limit"
    offset_query_param = "offset"
