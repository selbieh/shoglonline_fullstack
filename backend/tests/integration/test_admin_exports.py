"""Admin CSV exports (ADM-3): key models export their rows, the export respects the selected
queryset (filters), and each export is audited."""
import pytest
from django.contrib.admin.sites import AdminSite

from apps.accounts.admin import UserAdmin
from apps.accounts.models import User
from apps.contracts.admin import ContractAdmin
from apps.contracts.models import Contract
from apps.core.models import AuditLog
from apps.payments.admin import TransactionAdmin
from apps.payments.models import Transaction
from tests.factories import ContractFactory, StaffUserFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_user_export_returns_rows_and_audits(admin_request):
    UserFactory(email="alice@x.com")
    UserFactory(email="bob@x.com")
    resp = UserAdmin(User, AdminSite()).export_as_csv(admin_request(StaffUserFactory()), User.objects.all())
    assert resp["Content-Type"] == "text/csv"
    assert resp["Content-Disposition"].endswith("user_export.csv")
    body = resp.content.decode()
    assert "email" in body.splitlines()[0]  # header
    assert "alice@x.com" in body and "bob@x.com" in body
    assert AuditLog.objects.filter(action="admin.export_csv", model="user").exists()


def test_export_respects_selected_queryset(admin_request):
    keep = UserFactory(email="keep@x.com")
    UserFactory(email="drop@x.com")
    resp = UserAdmin(User, AdminSite()).export_as_csv(
        admin_request(StaffUserFactory()), User.objects.filter(pk=keep.pk)
    )
    body = resp.content.decode()
    assert "keep@x.com" in body and "drop@x.com" not in body


def test_contract_and_transaction_exports(admin_request, fund_wallet):
    ContractFactory(title="عقد التصدير")
    user = UserFactory()
    fund_wallet(user, "50")  # creates a DEPOSIT transaction

    contracts_csv = ContractAdmin(Contract, AdminSite()).export_as_csv(
        admin_request(StaffUserFactory()), Contract.objects.all()
    ).content.decode()
    assert "عقد التصدير" in contracts_csv

    tx_csv = TransactionAdmin(Transaction, AdminSite()).export_as_csv(
        admin_request(StaffUserFactory()), Transaction.objects.all()
    ).content.decode()
    assert "deposit" in tx_csv
