"""Admin console smoke sweep — the catch-all that surfaces admin misconfig before QA clicks a page.

As a superuser, this hits *every* model registered on the default admin site and exercises the
request-time code paths that Django's static system checks don't cover:

  * changelist render (list_display callables, get_queryset annotations, list_select_related,
    date_hierarchy, list_filter),
  * changelist with search + ordering (search_fields / ordering referencing a bad field → FieldError),
  * add-view render (fieldsets, readonly_fields, custom form, inlines referencing nonexistent fields),
  * every export_as_csv action wired up (ADM-3),
  * changelist render WITH a seeded row (per-row list_display — HTML tags, related-field access —
    which an empty table never exercises), for every model that has a factory.

Because it iterates the live registry, any admin added later is covered automatically. The Django
test client re-raises view exceptions by default, so a genuine crash fails the test with a full
traceback rather than a bare status code.
"""
import warnings

import factory
import pytest
from django.contrib import admin
from django.test import Client
from django.urls import reverse

from tests import factories as factories_pkg
from tests.factories import SuperUserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _registered():
    """(model, model_admin) for every model on the default admin site, sorted for stable test ids."""
    return sorted(
        admin.site._registry.items(),
        key=lambda kv: (kv[0]._meta.app_label, kv[0]._meta.model_name),
    )


REGISTRY = _registered()
MODELS = [m for m, _ in REGISTRY]
MODEL_IDS = [f"{m._meta.app_label}.{m._meta.model_name}" for m in MODELS]


def _url(model, view):
    return reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_{view}")


@pytest.fixture
def super_client(db):
    c = Client()
    c.force_login(SuperUserFactory())
    return c


def test_registry_is_populated():
    """Guard: if autodiscover regressed, the parametrized sweeps below would silently be empty."""
    assert MODELS, "no models registered on admin.site — did admin autodiscover run?"


# 302 is legitimate for singleton admins whose changelist redirects to the sole object's change page.
OK_LIST = (200, 302)


@pytest.mark.parametrize("model", MODELS, ids=MODEL_IDS)
def test_changelist_renders(super_client, model):
    resp = super_client.get(_url(model, "changelist"))
    assert resp.status_code in OK_LIST, f"{_url(model, 'changelist')} -> {resp.status_code}"


@pytest.mark.parametrize("model", MODELS, ids=MODEL_IDS)
def test_changelist_search_and_sort(super_client, model):
    """`?q=` exercises search_fields, `?o=1` exercises ordering — both raise FieldError on a bad field."""
    resp = super_client.get(_url(model, "changelist"), {"q": "x", "o": "1"})
    assert resp.status_code in OK_LIST, f"{_url(model, 'changelist')} (search/sort) -> {resp.status_code}"


@pytest.mark.parametrize("model", MODELS, ids=MODEL_IDS)
def test_add_view_renders(super_client, model):
    """200 when the admin allows adds; 302/403 when add is disabled (read-only / singleton). A crash raises."""
    resp = super_client.get(_url(model, "add"))
    assert resp.status_code in (200, 302, 403), f"{_url(model, 'add')} -> {resp.status_code}"


EXPORT_ADMINS = [(m, ma) for m, ma in REGISTRY if "export_as_csv" in (getattr(ma, "actions", None) or [])]
EXPORT_IDS = [f"{m._meta.app_label}.{m._meta.model_name}" for m, _ in EXPORT_ADMINS]


@pytest.mark.parametrize("model,model_admin", EXPORT_ADMINS, ids=EXPORT_IDS)
def test_export_action_is_wired(admin_request, model, model_admin):
    """export_as_csv resolves its columns and returns a CSV — catches a broken export_fields wiring."""
    resp = model_admin.export_as_csv(admin_request(SuperUserFactory()), model.objects.none())
    assert resp["Content-Type"] == "text/csv"


def _factory_by_model():
    """Map each model to a factory that builds it, so we can seed a real row before rendering.

    First factory wins per model — `__all__` lists UserFactory before Staff/SuperUserFactory, so
    plain users (not the superuser variants) back the accounts.user row."""
    out = {}
    for name in getattr(factories_pkg, "__all__", []):
        obj = getattr(factories_pkg, name, None)
        if isinstance(obj, type) and issubclass(obj, factory.django.DjangoModelFactory):
            out.setdefault(obj._meta.model, obj)
    return out


FACTORY_BY_MODEL = _factory_by_model()
SEEDABLE = [m for m in MODELS if m in FACTORY_BY_MODEL]
SEEDABLE_IDS = [f"{m._meta.app_label}.{m._meta.model_name}" for m in SEEDABLE]


@pytest.mark.parametrize("model", SEEDABLE, ids=SEEDABLE_IDS)
def test_changelist_renders_with_a_row(super_client, model):
    """Seed one real row, then render — exercises per-row list_display (HTML, related-field access)
    that a zero-row changelist can't reach. A non-null-safe list_display method crashes here."""
    FACTORY_BY_MODEL[model].create()
    resp = super_client.get(_url(model, "changelist"))
    assert resp.status_code in OK_LIST, f"{_url(model, 'changelist')} (with row) -> {resp.status_code}"


def test_row_coverage_is_visible():
    """Non-failing tripwire: name the registered models that have NO factory, so the per-row gap is
    explicit in the warnings summary rather than silently uncovered. Add a factory to shrink this."""
    uncovered = sorted(
        f"{m._meta.app_label}.{m._meta.model_name}" for m in MODELS if m not in FACTORY_BY_MODEL
    )
    if uncovered:
        warnings.warn(
            f"admin smoke: {len(uncovered)}/{len(MODELS)} models rendered EMPTY-only "
            f"(no factory → per-row list_display unexercised): {', '.join(uncovered)}",
            stacklevel=2,
        )
