import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import io
from typing import List
from models import Department, StockItem


def generate_export(dept: Department, items: List[StockItem], base_url: str = "") -> bytes:
    """Generate an Excel export with management qty vs physical qty comparison.
    Extra stock (management_qty=None) is grouped at the bottom.
    Photo links are added as clickable hyperlinks where available.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = dept.name[:31]

    # ── Styles ────────────────────────────────────────────────────
    header_font     = Font(bold=True, color="FFFFFF", size=11)
    header_fill     = PatternFill("solid", fgColor="1565C0")
    match_fill      = PatternFill("solid", fgColor="C8E6C9")   # Green  — match
    diff_fill       = PatternFill("solid", fgColor="FFCDD2")   # Red    — discrepancy
    unverified_fill = PatternFill("solid", fgColor="FFF9C4")   # Yellow — not verified
    extra_fill      = PatternFill("solid", fgColor="E1BEE7")   # Purple — extra stock
    extra_hdr_fill  = PatternFill("solid", fgColor="6A1B9A")   # Dark purple header
    link_font       = Font(color="1565C0", underline="single") # Blue hyperlink style
    center          = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin            = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"),  bottom=Side(style="thin")
    )

    # ── Split items: management vs extra stock ─────────────────────
    mgmt_items  = [i for i in items if i.management_qty is not None]
    extra_items = [i for i in items if i.management_qty is None]

    original_cols = dept.columns or []
    audit_cols    = ["Mgmt Qty", "Physical Qty", "Difference", "Remark",
                     "Verified By", "Verified At", "Status", "Photo"]
    all_headers   = original_cols + audit_cols
    photo_col_idx = len(original_cols) + len(audit_cols)  # last column = Photo

    def _get_photo_url(item: StockItem) -> str:
        """Return the first photo URL linked to this stock item, or ''."""
        if item.photos:
            return item.photos[0].file_url or ""
        return ""

    def write_header_row(row_idx: int):
        for col_idx, header in enumerate(all_headers, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=header)
            cell.font      = header_font
            cell.fill      = header_fill
            cell.alignment = center
            cell.border    = thin

    def write_item_row(row_idx: int, item: StockItem, is_extra: bool = False):
        # Original data columns
        for col_idx, col_name in enumerate(original_cols, start=1):
            val  = item.data.get(col_name, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.alignment = center
            cell.border    = thin

        offset   = len(original_cols) + 1
        mgmt_qty = item.management_qty
        phys_qty = item.physical_qty
        diff     = None
        if not is_extra and phys_qty is not None and mgmt_qty is not None:
            diff = round(phys_qty - mgmt_qty, 4)

        if is_extra:
            status   = "⭐ Extra Stock"
            row_fill = extra_fill
        elif item.verified:
            status   = "✅ Match" if diff == 0 else "❌ Discrepancy"
            row_fill = match_fill if diff == 0 else diff_fill
        else:
            status   = "⏳ Pending"
            row_fill = unverified_fill

        audit_values = [
            mgmt_qty if mgmt_qty is not None else ("N/A" if is_extra else ""),
            phys_qty if phys_qty is not None else ("N/A" if is_extra else ""),
            diff     if diff     is not None else ("—"   if is_extra else ""),
            item.remark      or "",
            item.verified_by or "",
            item.verified_at.strftime("%d-%m-%Y %H:%M") if item.verified_at else "",
            status,
            ""  # Photo placeholder — handled below
        ]

        for i, val in enumerate(audit_values):
            cell = ws.cell(row=row_idx, column=offset + i, value=val)
            cell.alignment = center
            cell.border    = thin
            cell.fill      = row_fill

        # ── Photo hyperlink in the last column ────────────────────
        photo_url = _get_photo_url(item)
        photo_cell = ws.cell(row=row_idx, column=photo_col_idx)
        photo_cell.border    = thin
        photo_cell.alignment = center
        photo_cell.fill      = row_fill

        if photo_url:
            # Make it a real clickable hyperlink
            if photo_url.startswith("/"):
                # Use base_url if provided, else fallback to relative or localhost
                full_url = f"{base_url}{photo_url}" if base_url else photo_url
                photo_cell.value     = "📷 View Photo"
                photo_cell.hyperlink = full_url
                photo_cell.font      = link_font
            else:
                # Google Drive or other absolute URL
                photo_cell.value     = "📷 View Photo"
                photo_cell.hyperlink = photo_url
                photo_cell.font      = link_font
        else:
            photo_cell.value = "—"

    # ── Section 1: Column headers ──────────────────────────────────
    write_header_row(1)

    # ── Section 2: Management stock rows ──────────────────────────
    for row_idx, item in enumerate(mgmt_items, start=2):
        write_item_row(row_idx, item, is_extra=False)

    # ── Section 3: Extra stock separator + rows ───────────────────
    extra_start = len(mgmt_items) + 2  # blank gap row
    if extra_items:
        ws.row_dimensions[extra_start].height = 8  # thin blank separator

        # Purple section header
        sep_row  = extra_start + 1
        sep_cell = ws.cell(row=sep_row, column=1,
                           value=f"⭐ EXTRA STOCK — Items found by team, NOT in management sheet ({len(extra_items)} items)")
        sep_cell.font      = Font(bold=True, color="FFFFFF", size=11)
        sep_cell.fill      = extra_hdr_fill
        sep_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.merge_cells(start_row=sep_row, start_column=1,
                       end_row=sep_row,   end_column=len(all_headers))
        ws.row_dimensions[sep_row].height = 22

        # Extra stock column headers
        write_header_row(sep_row + 1)

        # Extra stock rows
        for i, item in enumerate(extra_items):
            write_item_row(sep_row + 2 + i, item, is_extra=True)

    # ── Column widths ──────────────────────────────────────────────
    for col_idx in range(1, len(all_headers) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 16
    # Photo column a bit wider
    ws.column_dimensions[get_column_letter(photo_col_idx)].width = 20

    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"

    # ── Summary ───────────────────────────────────────────────────
    last_data_row = (extra_start + 2 + len(extra_items)) if extra_items else (len(mgmt_items) + 1)
    summary_row   = last_data_row + 3

    total      = len(mgmt_items)
    verified   = sum(1 for i in mgmt_items if i.verified)
    diff_count = sum(
        1 for i in mgmt_items
        if i.verified and i.physical_qty is not None
        and i.physical_qty != (i.management_qty or 0)
    )
    with_photos = sum(1 for i in items if i.photos)

    ws.cell(row=summary_row,     column=1, value="SUMMARY").font = Font(bold=True, size=12)
    ws.cell(row=summary_row + 1, column=1, value=f"Management Stock Items : {total}")
    ws.cell(row=summary_row + 2, column=1, value=f"Verified               : {verified}")
    ws.cell(row=summary_row + 3, column=1, value=f"Pending                : {total - verified}")
    ws.cell(row=summary_row + 4, column=1, value=f"Discrepancies          : {diff_count}")
    ws.cell(row=summary_row + 5, column=1, value=f"Extra Stock Found      : {len(extra_items)}")
    ws.cell(row=summary_row + 6, column=1, value=f"Photos Attached        : {with_photos}")

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
