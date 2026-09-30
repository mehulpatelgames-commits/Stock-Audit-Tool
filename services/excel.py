import openpyxl
import io
from typing import Tuple, List, Dict, Any


def parse_excel(file_bytes: bytes, qty_column: str) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Parse an Excel file and return:
    - columns: list of all column names (from first row)
    - rows: list of dicts, one per row
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)

    # First row = headers
    headers = [str(cell).strip() if cell is not None else f"Col{i}" for i, cell in enumerate(next(rows_iter))]

    rows = []
    for row in rows_iter:
        row_dict = {}
        empty = True
        for i, val in enumerate(row):
            if i < len(headers):
                col_name = headers[i]
                row_dict[col_name] = val if val is not None else ""
                if val is not None and str(val).strip():
                    empty = False
        if not empty:
            rows.append(row_dict)

    wb.close()
    return headers, rows
