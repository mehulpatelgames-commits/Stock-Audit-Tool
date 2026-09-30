from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.sql import func
from database import get_db
from models import StockItem, Department
from schemas import StockItemOut, StockUpdateRequest, EditLockRequest
from services.export import generate_export
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Any, Dict, Optional
import io

router = APIRouter(prefix="/api/stock", tags=["stock"])

class AddItemRequest(BaseModel):
    department_id: int
    data: Dict[str, Any]
    verified_by: Optional[str] = None


# Edit lock timeout in seconds — if user doesn't unlock in 5 min, auto-release
EDIT_LOCK_TIMEOUT = 300


@router.get("/{dept_id}", response_model=list[StockItemOut])
async def get_stock(
    dept_id: int,
    search: str = Query(default=""),
    db: AsyncSession = Depends(get_db)
):
    """Fetch stock items for a department with optional search"""
    result = await db.execute(
        select(StockItem).where(StockItem.department_id == dept_id)
    )
    items = result.scalars().all()

    if search:
        search_lower = search.lower().replace(" ", "").replace("-", "")
        items = [
            item for item in items
            if any(
                search_lower in str(v).lower().replace(" ", "").replace("-", "")
                for v in item.data.values()
            )
        ]

    return items


@router.patch("/{item_id}/update")
async def update_stock(item_id: int, body: StockUpdateRequest, db: AsyncSession = Depends(get_db)):
    """Save verification result for a stock item"""
    result = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.physical_qty = body.physical_qty
    item.remark = body.remark
    item.verified = True
    item.verified_by = body.verified_by
    item.verified_at = datetime.now(timezone.utc)
    item.being_edited_by = None
    item.edit_started_at = None
    await db.commit()
    return {"message": "Saved"}


@router.patch("/{item_id}/edit-lock")
async def edit_lock(item_id: int, body: EditLockRequest, db: AsyncSession = Depends(get_db)):
    """Lock or unlock an item for editing — enables concurrent edit warnings"""
    result = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if body.action == "lock":
        # Check if already locked by someone else (and not timed out)
        if item.being_edited_by and item.being_edited_by != body.user_name:
            if item.edit_started_at:
                elapsed = (datetime.now(timezone.utc) - item.edit_started_at).total_seconds()
                if elapsed < EDIT_LOCK_TIMEOUT:
                    return {
                        "locked": True,
                        "by": item.being_edited_by,
                        "warning": f"⚠️ Being edited by {item.being_edited_by}"
                    }
        item.being_edited_by = body.user_name
        item.edit_started_at = datetime.now(timezone.utc)
    elif body.action == "unlock":
        if item.being_edited_by == body.user_name:
            item.being_edited_by = None
            item.edit_started_at = None

    await db.commit()
    return {"locked": False, "by": body.user_name}


@router.get("/{dept_id}/export")
async def export_stock(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Export department stock as Excel report"""
    dept_result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    items_result = await db.execute(
        select(StockItem).where(StockItem.department_id == dept_id)
    )
    items = items_result.scalars().all()

    excel_bytes = generate_export(dept, items)
    filename = f"{dept.name}_audit_export.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/add")
async def add_stock_item(body: AddItemRequest, db: AsyncSession = Depends(get_db)):
    """Add a single new stock item to a department"""
    dept_result = await db.execute(select(Department).where(Department.id == body.department_id))
    dept = dept_result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    item = StockItem(
        department_id=body.department_id,
        data=body.data,
        management_qty=None,
        verified=True if body.verified_by else False,
        verified_by=body.verified_by,
        verified_at=datetime.now(timezone.utc) if body.verified_by else None
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"message": "Added", "id": item.id}
