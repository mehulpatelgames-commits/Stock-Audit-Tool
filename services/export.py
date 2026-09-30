import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
from typing import List
from models import Department, StockItem


def generate_export(dept: Department, items: List[StockItem]) -> bytes:
    """Generate an Excel export with management qty vs physical qty comparison"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = dept.name[:31]  # Excel sheet name max 31 chars

    # ── Styles ────────────────────────────────────────────────────
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill("solid", fgColor="1565C0")
    diff_fill = PatternFill("solid", fgColor="FFCDD2")    # Red — discrepancy
    match_fill = PatternFill("solid", fgColor="C8E6C9")   # Green — match
    unverified_fill = PatternFill("solid", fgColor="FFF9C4")  # Yellow — not verified
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin")
    )

    # ── Build headers ─────────────────────────────────────────────
    original_cols = dept.columns or []
    audit_cols = ["Physical Qty", "Difference", "Remark", "Verified By", "Verified At", "Status"]
    all_headers = original_cols + audit_cols

    for col_idx, header in enumerate(all_headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = thin_border

    # ── Write rows ────────────────────────────────────────────────
    for row_idx, item in enumerate(items, start=2):
        # Original data columns
        for col_idx, col_name in enumerate(original_cols, start=1):
            val = item.data.get(col_name, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.alignment = center
            cell.border = thin_border

        # Audit result columns
        offset = len(original_cols) + 1
        mgmt_qty = item.management_qty or 0
        phys_qty = item.physical_qty
        diff = (phys_qty - mgmt_qty) if phys_qty is not None else None

        if item.verified:
            status = "✅ Verified"
            row_fill = match_fill if diff == 0 else diff_fill
        else:
            status = "⏳ Pending"
            row_fill = unverified_fill

        audit_values = [
            phys_qty if phys_qty is not None else "",
            diff if diff is not None else "",
            item.remark or "",
            item.verified_by or "",
            item.verified_at.strftime("%d-%m-%Y %H:%M") if item.verified_at else "",
            status
        ]

        for i, val in enumerate(audit_values):
            cell = ws.cell(row=row_idx, column=offset + i, value=val)
            cell.alignment = center
            cell.border = thin_border
            if i == 0:  # Physical Qty column — apply row fill
                cell.fill = row_fill

    # ── Auto-size columns ─────────────────────────────────────────
    for col_idx in range(1, len(all_headers) + 1):
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = 16

    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"

    # ── Summary row ───────────────────────────────────────────────
    total = len(items)
    verified = sum(1 for i in items if i.verified)
    diff_count = sum(1 for i in items if i.verified and i.physical_qty is not None and i.physical_qty != (i.management_qty or 0))

    summary_row = total + 3
    ws.cell(row=summary_row, column=1, value="SUMMARY").font = Font(bold=True)
    ws.cell(row=summary_row + 1, column=1, value=f"Total Items: {total}")
    ws.cell(row=summary_row + 2, column=1, value=f"Verified: {verified}")
    ws.cell(row=summary_row + 3, column=1, value=f"Pending: {total - verified}")
    ws.cell(row=summary_row + 4, column=1, value=f"Discrepancies: {diff_count}")

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
