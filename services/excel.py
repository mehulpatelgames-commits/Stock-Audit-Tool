import openpyxl
import io
from datetime import datetime, date
from typing import Tuple, List, Dict, Any


def _safe(val) -> Any:
    """Convert any value to a JSON-serializable type."""
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%d-%m-%Y") if isinstance(val, date) else val.strftime("%d-%m-%Y %H:%M")
    if isinstance(val, float):
        # Return int if it's a whole number (e.g. 116.0 → 116)
        return int(val) if val == int(val) else round(val, 4)
    if isinstance(val, int):
        return val
    return str(val).strip()


def parse_excel(file_bytes: bytes, qty_column: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parse an Excel file and return:
    - columns: list of all column names (from first row)
    - rows: list of dicts, one per row, with all values JSON-safe
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)

    # First row = headers
    headers = [
        str(cell).strip() if cell is not None else f"Col{i}"
        for i, cell in enumerate(next(rows_iter))
    ]

    rows = []
    for row in rows_iter:
        row_dict = {}
        empty = True
        for i, val in enumerate(row):
            if i < len(headers):
                col_name  = headers[i]
                safe_val  = _safe(val)
                row_dict[col_name] = safe_val
                if safe_val != "" and safe_val is not None:
                    empty = False
        if not empty:
            rows.append(row_dict)

    wb.close()
    return headers, rows
