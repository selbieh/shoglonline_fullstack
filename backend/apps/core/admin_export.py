"""Reusable CSV export for admin list views (ADM-3).

Dependency-free (stdlib csv). Add `ExportCsvMixin` to a ModelAdmin and list "export_as_csv" in its
actions; the export operates on the selected/filtered queryset and writes an AuditLog row (data
access is sensitive). Set `export_fields` to restrict columns; defaults to all concrete fields."""
import csv

from django.contrib import admin
from django.http import HttpResponse

from apps.core.models import AuditLog


class ExportCsvMixin:
    export_fields = None  # list[str] of field names; None → all concrete model fields

    def _resolved_export_fields(self):
        return list(self.export_fields) if self.export_fields else [f.name for f in self.model._meta.fields]

    @admin.action(description="📥 Export selected to CSV")
    def export_as_csv(self, request, queryset):
        fields = self._resolved_export_fields()
        meta = self.model._meta
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f"attachment; filename={meta.model_name}_export.csv"
        writer = csv.writer(response)
        writer.writerow(fields)
        count = 0
        for obj in queryset:
            writer.writerow([self._cell(obj, name) for name in fields])
            count += 1
        AuditLog.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            action="admin.export_csv", model=meta.model_name,
            after={"count": count, "fields": fields},
        )
        return response

    # Leading chars that spreadsheet apps (Excel/Calc/Sheets) treat as a formula trigger.
    _FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

    @classmethod
    def _cell(cls, obj, name):
        value = getattr(obj, name, "")
        if value is None:
            return ""
        text = str(value)
        # CSV-injection guard: neutralize user-controlled values that would execute as a
        # formula when the export is opened in a spreadsheet. Prefixing with ' is the
        # standard mitigation (quoting alone does NOT stop it).
        if text and text[0] in cls._FORMULA_PREFIXES:
            text = "'" + text
        return text
