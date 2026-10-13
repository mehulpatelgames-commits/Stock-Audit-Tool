from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from database import get_db
from models import Department, StockItem
from schemas import DepartmentOut, FilterColumnsUpdate
from services.excel import parse_excel
from typing import Optional

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("/audit/{audit_id}", response_model=list[DepartmentOut])
async def list_departments(audit_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.audit_id == audit_id))
    departments = result.scalars().all()

    out = []
    for dept in departments:
        total = await db.execute(
            select(func.count()).where(StockItem.department_id == dept.id)
        )
        verified = await db.execute(
            select(func.count()).where(StockItem.department_id == dept.id, StockItem.verified == True)
        )
        out.append(DepartmentOut(
            id=dept.id,
            audit_id=dept.audit_id,
            name=dept.name,
            columns=dept.columns or [],
            filter_columns=dept.filter_columns or [],
            verification_method=dept.verification_method or "general",
            party_col=dept.party_col,
            order_col=dept.order_col,
            ready_qty_col=dept.ready_qty_col,
            total_items=total.scalar(),
            verified_items=verified.scalar()
        ))
    return out


@router.post("/inspect-sheet")
async def inspect_sheet(file: UploadFile = File(...)):
    """Inspect first row of uploaded sheet to return detected column headers"""
    contents = await file.read()
    columns, _ = parse_excel(contents, qty_column="")
    return {"columns": columns}


@router.post("/import")
async def import_department(
    audit_id: int = Form(...),
    dept_name: str = Form(...),
    verification_method: str = Form(default="general"),
    qty_column: Optional[str] = Form(default=""),
    party_col: Optional[str] = Form(default=""),
    order_col: Optional[str] = Form(default=""),
    ready_qty_col: Optional[str] = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload an Excel file to create/replace a department's stock data"""
    contents = await file.read()
    target_qty_col = ready_qty_col if verification_method == "finish_goods" else qty_column
    columns, rows = parse_excel(contents, target_qty_col)

    # Delete existing department with same name in this audit (re-import)
    existing = await db.execute(
        select(Department).where(Department.audit_id == audit_id, Department.name == dept_name)
    )
    existing_dept = existing.scalars().first()
    if existing_dept:
        await db.execute(delete(StockItem).where(StockItem.department_id == existing_dept.id))
        await db.delete(existing_dept)
        await db.commit()

    if verification_method == "finish_goods":
        filter_cols = [c for c in [party_col, order_col] if c and c in columns]
        if not filter_cols:
            filter_cols = columns[:2] if columns else []
    else:
        filter_cols = ["Stand"] if "Stand" in columns else (columns[:2] if columns else [])

    dept = Department(
        audit_id=audit_id,
        name=dept_name,
        columns=columns,
        filter_columns=filter_cols,
        verification_method=verification_method,
        party_col=party_col or None,
        order_col=order_col or None,
        ready_qty_col=ready_qty_col or None
    )
    db.add(dept)
    await db.flush()

    def to_float(val):
        """Convert qty value to float or None — never empty string."""
        if val is None or val == '':
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    # Bulk insert stock items
    items = [
        StockItem(
            department_id=dept.id,
            data=row,
            management_qty=to_float(row.get(target_qty_col)) if target_qty_col else None
        )
        for row in rows
    ]
    db.add_all(items)
    await db.commit()

    return {
        "message": f"Imported {len(items)} items into '{dept_name}' ({verification_method})",
        "department_id": dept.id,
        "columns": columns,
        "verification_method": verification_method
    }


@router.patch("/{dept_id}/filter-columns")
async def update_filter_columns(dept_id: int, body: FilterColumnsUpdate, db: AsyncSession = Depends(get_db)):
    """Admin or user updates which columns appear as filters"""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.filter_columns = body.filter_columns
    await db.commit()
    return {"message": "Filter columns updated", "filter_columns": dept.filter_columns}


@router.delete("/{dept_id}")
async def delete_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Admin removes a department and its sheet data to reduce database load"""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    
    # Delete associated photo logs and stock items
    from models import PhotoLog
    await db.execute(delete(PhotoLog).where(PhotoLog.department_id == dept_id))
    await db.execute(delete(StockItem).where(StockItem.department_id == dept_id))
    await db.delete(dept)
    await db.commit()
    return {"message": f"Department '{dept.name}' and all associated stock data removed successfully"}
