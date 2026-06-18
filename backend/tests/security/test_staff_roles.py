"""Staff admin access + least-privilege role groups (FR-ADM-8). Staff log in to the Unfold admin
with email + password (no 2FA); the role groups scope what each staff member can touch."""
import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import Client

from apps.accounts.models import User

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def _staff(email):
    return User.objects.create_user(email=email, password="pw", is_staff=True, is_superuser=True)


def test_admin_login_is_password_only():
    # No OTP/2FA layer — a staff member reaches the admin with just their session (password) login.
    client = Client()
    client.force_login(_staff("pwonly@x.com"))
    assert client.get("/admin/").status_code == 200


def test_role_groups_are_least_privilege():
    call_command("setup_staff_roles")
    for name in ("Super", "Ops", "Finance", "Support", "Content"):
        assert Group.objects.filter(name=name).exists()

    finance = set(Group.objects.get(name="Finance").permissions.values_list("codename", flat=True))
    assert {"view_withdrawalrequest", "change_withdrawalrequest"} <= finance
    assert not any(c.endswith("_job") for c in finance)        # no cross-domain reach
    assert not any(c.startswith("delete_") for c in finance)   # never destructive


def test_group_member_gets_only_scoped_permissions():
    call_command("setup_staff_roles")
    user = User.objects.create_user(email="support@x.com", is_staff=True)
    user.groups.add(Group.objects.get(name="Support"))
    user = User.objects.get(pk=user.pk)  # drop the per-instance perm cache
    assert user.has_perm("accounts.change_user")             # Support can freeze/activate users
    assert not user.has_perm("payments.change_withdrawalrequest")  # but not Finance actions


def test_setup_staff_roles_is_idempotent():
    call_command("setup_staff_roles")
    call_command("setup_staff_roles")
    assert Group.objects.filter(name="Ops").count() == 1
