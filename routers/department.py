from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from database import get_db
from models import Department, StockItem
from schemas import DepartmentOut, FilterColumnsUpdate
from services.excel import parse_excel

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
            total_items=total.scalar(),
            verified_items=verified.scalar()
        ))
    return out


@router.post("/import")
async def import_department(
    audit_id: int = Form(...),
    dept_name: str = Form(...),
    qty_column: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload an Excel file to create/replace a department's stock data"""
    contents = await file.read()
    columns, rows = parse_excel(contents, qty_column)

    # Delete existing department with same name in this audit (re-import)
    existing = await db.execute(
        select(Department).where(Department.audit_id == audit_id, Department.name == dept_name)
    )
    existing_dept = existing.scalars().first()
    if existing_dept:
        await db.execute(delete(StockItem).where(StockItem.department_id == existing_dept.id))
        await db.delete(existing_dept)
        await db.commit()

    # Create new department
    dept = Department(
        audit_id=audit_id,
        name=dept_name,
        columns=columns,
        filter_columns=["Stand"] if "Stand" in columns else (columns[:2] if columns else [])
    )
    db.add(dept)
    await db.flush()

    # Bulk insert stock items
    items = [
        StockItem(
            department_id=dept.id,
            data=row,
            management_qty=row.get(qty_column)
        )
        for row in rows
    ]
    db.add_all(items)
    await db.commit()

    return {
        "message": f"Imported {len(items)} items into '{dept_name}'",
        "department_id": dept.id,
        "columns": columns
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
    """Admin discards a department's imported data"""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await db.delete(dept)
    await db.commit()
    return {"message": "Department deleted"}
