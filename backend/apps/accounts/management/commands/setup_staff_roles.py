"""Create the least-privilege staff role groups (FR-ADM-8 / FR-AUTH-8). Idempotent.

Role → permission matrix (documented in docs/staff-roles.md). Every scoped group gets only the
listed actions on its own domain models; **no group gets `delete`** (destructive removal stays a
superuser action, and append-only logs like AuditLog are never deletable). `Super` carries every
permission.

    Super    — full platform control (all permissions)
    Ops      — marketplace moderation: jobs, proposals, invitations, services, requests, catalog
    Finance  — money: wallets/transactions (view), withdrawals, invoices, affiliate rules
    Support  — users (freeze/activate), tickets, chat (view), notifications, ID verification
    Content  — CMS: landing sections, pages, FAQ
"""
from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand

VIEW = ("view",)
VIEW_CHANGE = ("view", "change")
VIEW_ADD_CHANGE = ("view", "add", "change")

# group → list of (app_label, model, actions); "ALL" means every permission.
ROLE_MATRIX: dict[str, object] = {
    "Super": "ALL",
    "Ops": [
        ("jobs", "job", VIEW_CHANGE),
        ("jobs", "proposal", VIEW_CHANGE),
        ("jobs", "invitation", VIEW_CHANGE),
        ("gigs", "service", VIEW_CHANGE),
        ("gigs", "buyingrequest", VIEW_CHANGE),
        ("catalog", "category", VIEW_ADD_CHANGE),
        ("catalog", "skill", VIEW_ADD_CHANGE),
        ("bids", "bidplan", VIEW_ADD_CHANGE),
    ],
    "Finance": [
        ("payments", "wallet", VIEW),
        ("payments", "transaction", VIEW),
        ("payments", "withdrawalrequest", VIEW_CHANGE),
        ("invoices", "invoicerequest", VIEW_CHANGE),
        ("affiliate", "commissionrule", VIEW_ADD_CHANGE),
        ("affiliate", "affiliatecommission", VIEW),
    ],
    "Support": [
        ("accounts", "user", VIEW_CHANGE),  # freeze/activate run as admin actions → need change
        ("tickets", "ticket", VIEW_CHANGE),
        ("tickets", "tickettype", VIEW_ADD_CHANGE),
        ("chat", "conversation", VIEW),
        ("notifications", "notification", VIEW_ADD_CHANGE),
        ("profiles", "idverification", VIEW_CHANGE),
        ("profiles", "workerprofile", VIEW),
    ],
    "Content": [
        ("cms", "landingsection", VIEW_ADD_CHANGE),
        ("cms", "contentpage", VIEW_ADD_CHANGE),
        ("cms", "faqitem", VIEW_ADD_CHANGE),
    ],
}


def assign_staff_roles() -> dict[str, int]:
    """Create/refresh the role groups and return {group_name: permission_count}."""
    summary: dict[str, int] = {}
    for name, spec in ROLE_MATRIX.items():
        group, _ = Group.objects.get_or_create(name=name)
        if spec == "ALL":
            perms = list(Permission.objects.all())
        else:
            perms = []
            for app_label, model, actions in spec:
                codenames = [f"{action}_{model}" for action in actions]
                perms += list(Permission.objects.filter(
                    content_type__app_label=app_label, content_type__model=model,
                    codename__in=codenames,
                ))
        group.permissions.set(perms)
        summary[name] = len(perms)
    return summary


class Command(BaseCommand):
    help = "Create least-privilege staff role groups (Super/Ops/Finance/Support/Content)."

    def handle(self, *args, **options):
        summary = assign_staff_roles()
        for name, count in summary.items():
            self.stdout.write(self.style.SUCCESS(f"{name}: {count} permissions"))
