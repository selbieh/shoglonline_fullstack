"""Invoice services — period gathering, employer confirmation, PDF generation (FR-PAY-7)."""
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.money import fmt_usd
from .models import InvoiceLine, InvoiceRequest

ERR = {
    "empty": {"code": "no_contracts", "message_ar": "لا عقود مكتملة في هذه الفترة مع صاحب العمل"},
    "not_employer": {"code": "not_employer", "message_ar": "لست صاحب العمل في هذه الفاتورة"},
    "not_pending": {"code": "not_pending", "message_ar": "لا يمكن تنفيذ الإجراء في حالة الفاتورة الحالية"},
}


def period_bounds(period_type: str, anchor: date) -> tuple[date, date]:
    if period_type == InvoiceRequest.Period.WEEK:
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    start = anchor.replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, next_month - timedelta(days=1)


@transaction.atomic
def create_invoice_request(*, worker, employer, period_type: str, anchor: date = None, notes: str = "") -> InvoiceRequest:
    """Gather the worker's completed contracts with this employer in the period (FR-PAY-7)."""
    from apps.contracts.models import Contract

    anchor = anchor or timezone.now().date()
    start, end = period_bounds(period_type, anchor)
    contracts = Contract.objects.filter(
        worker=worker, employer=employer, status=Contract.Status.COMPLETED,
        completed_at__date__gte=start, completed_at__date__lte=end,
    ).exclude(
        # Never bill the same contract on two invoices (overlapping periods would double-count the
        # same earnings into conflicting documents). Rejected invoices free their contracts again.
        invoice_lines__invoice__status__in=[InvoiceRequest.Status.REQUESTED, InvoiceRequest.Status.CONFIRMED],
    )
    if not contracts.exists():
        raise ValidationError(ERR["empty"])

    invoice = InvoiceRequest.objects.create(
        worker=worker, employer=employer, period_type=period_type,
        period_start=start, period_end=end, notes=notes,
    )
    total = Decimal("0")
    for c in contracts:
        InvoiceLine.objects.create(invoice=invoice, contract=c, description=c.title, amount=c.worker_earning)
        total += c.worker_earning
    invoice.total = total
    invoice.number = f"INV-{invoice.pk:06d}"
    invoice.save(update_fields=["total", "number"])
    return invoice


@transaction.atomic
def confirm_invoice(invoice: InvoiceRequest, employer) -> InvoiceRequest:
    if invoice.employer_id != employer.id:
        raise PermissionDenied(ERR["not_employer"])
    if invoice.status != InvoiceRequest.Status.REQUESTED:
        raise ValidationError(ERR["not_pending"])
    invoice.status = InvoiceRequest.Status.CONFIRMED
    invoice.confirmed_at = timezone.now()
    invoice.pdf_url = _generate_pdf(invoice)
    invoice.save(update_fields=["status", "confirmed_at", "pdf_url"])
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)
    notify(invoice.worker, kind="payment", title=f"تم اعتماد فاتورتك {invoice.number}",
           body=f"اعتمد صاحب العمل فاتورتك بقيمة {fmt_usd(invoice.total)}.", deep_link="/invoices")
    return invoice


def reject_invoice(invoice: InvoiceRequest, employer, reason: str) -> InvoiceRequest:
    if invoice.employer_id != employer.id:
        raise PermissionDenied(ERR["not_employer"])
    if invoice.status != InvoiceRequest.Status.REQUESTED:
        raise ValidationError(ERR["not_pending"])
    invoice.status = InvoiceRequest.Status.REJECTED
    invoice.reject_reason = reason
    invoice.save(update_fields=["status", "reject_reason"])
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)
    notify(invoice.worker, kind="payment", title=f"تم رفض فاتورتك {invoice.number}",
           body=f"رفض صاحب العمل فاتورتك. السبب: {reason[:150] or '—'}", deep_link="/invoices")
    return invoice


def _generate_pdf(invoice: InvoiceRequest) -> str:
    """Render a simple PDF invoice to MEDIA and return its URL. Best-effort: if
    reportlab is unavailable the invoice still confirms (PDF can be regenerated)."""
    try:
        from pathlib import Path

        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:  # pragma: no cover
        return ""

    media = Path(settings.MEDIA_ROOT) / "invoices"
    media.mkdir(parents=True, exist_ok=True)
    path = media / f"{invoice.number}.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    y = height - 60
    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, y, f"Invoice {invoice.number}")
    c.setFont("Helvetica", 10)
    y -= 24
    c.drawString(50, y, f"Worker: {invoice.worker.email}   Employer: {invoice.employer.email}")
    y -= 16
    c.drawString(50, y, f"Period: {invoice.period_start} - {invoice.period_end}")
    y -= 30
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, "Contract")
    c.drawString(420, y, "Amount")
    c.setFont("Helvetica", 10)
    for line in invoice.lines.all():
        y -= 18
        c.drawString(50, y, line.description[:60])
        c.drawString(420, y, f"{line.amount} USD")
    y -= 28
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "Total")
    c.drawString(420, y, f"{invoice.total} USD")
    c.showPage()
    c.save()
    return f"{settings.MEDIA_URL}invoices/{invoice.number}.pdf"
