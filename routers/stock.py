from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import func
from database import get_db
from models import StockItem, Department, StockBatch
from schemas import StockItemOut, StockUpdateRequest, EditLockRequest, FGBatchAddRequest
from services.export import generate_export, generate_fg_export
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Any, Dict, Optional, List
import io

router = APIRouter(prefix="/api/stock", tags=["stock"])

class AddItemRequest(BaseModel):
    department_id: int
    data:          Dict[str, Any]
    remark:        Optional[str] = None
    verified_by:   Optional[str] = None


# Edit lock timeout in seconds — if user doesn't unlock in 5 min, auto-release
EDIT_LOCK_TIMEOUT = 300


@router.get("/{dept_id}", response_model=list[StockItemOut])
async def get_stock(
    dept_id: int,
    search: str = Query(default=""),
    db: AsyncSession = Depends(get_db)
):
    """Fetch stock items for a department with optional search and loaded photos"""
    result = await db.execute(
        select(StockItem)
        .where(StockItem.department_id == dept_id)
        .options(selectinload(StockItem.photos))
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
    if body.physical_qty is not None and body.physical_qty < 0:
        raise HTTPException(status_code=400, detail="Physical quantity cannot be negative")

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
async def export_stock(dept_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Export department stock as Excel report"""
    dept_result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    items_result = await db.execute(
        select(StockItem)
        .where(StockItem.department_id == dept_id)
        .options(selectinload(StockItem.photos))   # eagerly load photo links
    )
    items = items_result.scalars().all()

    # Determine real public base URL (handling proxies/Railway SSL)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    base_url = f"{proto}://{host}" if host else str(request.base_url).rstrip('/')

    if dept.verification_method == "finish_goods":
        batches_result = await db.execute(
            select(StockBatch)
            .where(StockBatch.department_id == dept_id)
            .order_by(StockBatch.id.asc())
        )
        batches = batches_result.scalars().all()
        excel_bytes = generate_fg_export(dept, items, batches)
    else:
        excel_bytes = generate_export(dept, items, base_url=base_url)

    filename = f"{dept.name}_audit_export.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/add")
async def add_stock_item(body: AddItemRequest, db: AsyncSession = Depends(get_db)):
    """Add an extra stock item (not in management sheet) with optional remark"""
    dept_result = await db.execute(select(Department).where(Department.id == body.department_id))
    dept = dept_result.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Mark extra stock clearly — management_qty stays None to distinguish from imported items
    remark = body.remark or ""
    if "EXTRA STOCK" not in remark.upper():
        remark = f"[EXTRA STOCK] {remark}".strip().rstrip("]").strip() if not remark else f"[EXTRA STOCK] {remark}"

    item = StockItem(
        department_id = body.department_id,
        data          = body.data,
        management_qty= None,           # None = extra stock marker
        physical_qty  = None,           # not applicable for extra stock
        remark        = remark,
        verified      = True,           # extra stock is auto-verified (team found it)
        verified_by   = body.verified_by,
        verified_at   = datetime.now(timezone.utc) if body.verified_by else None
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"message": "Extra stock added", "id": item.id}


# ═════════════════════════════════════════════════════════════
# FINISH GOODS SPECIFIC VERIFICATION ENDPOINTS
# ═════════════════════════════════════════════════════════════

@router.get("/fg/{dept_id}/summary")
async def get_fg_summary(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Summary statistics for Finish Goods verification"""
    items_res = await db.execute(select(StockItem).where(StockItem.department_id == dept_id))
    items = items_res.scalars().all()

    batches_res = await db.execute(select(StockBatch).where(StockBatch.department_id == dept_id))
    batches = batches_res.scalars().all()

    batch_map = {}
    for b in batches:
        batch_map[b.stock_item_id] = batch_map.get(b.stock_item_id, 0) + b.total_pcs

    total_orders = len(items)
    total_ready_pcs = sum(i.management_qty or 0.0 for i in items if i.management_qty is not None)
    total_verified_pcs = sum(b.total_pcs for b in batches)
    total_pending_pcs = max(0.0, total_ready_pcs - total_verified_pcs)

    matched = 0
    discrepancy = 0
    pending = 0

    for i in items:
        verified = batch_map.get(i.id, 0)
        target = i.management_qty or 0.0
        if verified == 0:
            pending += 1
        elif verified == target:
            matched += 1
        else:
            discrepancy += 1

    return {
        "total_orders": total_orders,
        "total_ready_pcs": total_ready_pcs,
        "total_verified_pcs": total_verified_pcs,
        "total_pending_pcs": total_pending_pcs,
        "matched": matched,
        "discrepancy": discrepancy,
        "pending": pending
    }


@router.get("/fg/{dept_id}/parties")
async def get_fg_parties(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Aggregated parties list with order counts and ready/verified pieces"""
    dept_res = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_res.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    party_col = dept.party_col or "PARTY"

    items_res = await db.execute(select(StockItem).where(StockItem.department_id == dept_id))
    items = items_res.scalars().all()

    batches_res = await db.execute(select(StockBatch).where(StockBatch.department_id == dept_id))
    batches = batches_res.scalars().all()

    batch_map = {}
    for b in batches:
        batch_map[b.stock_item_id] = batch_map.get(b.stock_item_id, 0) + b.total_pcs

    party_dict = {}
    for i in items:
        p = str(i.data.get(party_col, "Unassigned")).strip() or "Unassigned"
        if p not in party_dict:
            party_dict[p] = {"party": p, "orders_count": 0, "total_ready": 0.0, "total_verified": 0}
        party_dict[p]["orders_count"] += 1
        party_dict[p]["total_ready"] += (i.management_qty or 0.0)
        party_dict[p]["total_verified"] += batch_map.get(i.id, 0)

    for p, stats in party_dict.items():
        stats["total_pending"] = max(0.0, stats["total_ready"] - stats["total_verified"])

    return sorted(party_dict.values(), key=lambda x: x["party"])


@router.get("/fg/{dept_id}/orders")
async def get_fg_orders(dept_id: int, party: str = Query(default=""), db: AsyncSession = Depends(get_db)):
    """Orders for a party with pending balances and status"""
    dept_res = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_res.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    party_col = dept.party_col or "PARTY"
    order_col = dept.order_col or "ORDER NO"

    items_res = await db.execute(select(StockItem).where(StockItem.department_id == dept_id))
    items = items_res.scalars().all()

    batches_res = await db.execute(select(StockBatch).where(StockBatch.department_id == dept_id))
    batches = batches_res.scalars().all()

    batch_map = {}
    for b in batches:
        batch_map[b.stock_item_id] = batch_map.get(b.stock_item_id, 0) + b.total_pcs

    res = []
    for i in items:
        item_party = str(i.data.get(party_col, "")).strip()
        if party and item_party != party:
            continue

        verified = batch_map.get(i.id, 0)
        target = i.management_qty or 0.0
        pending = target - verified
        diff = verified - target

        if verified == 0:
            status = "Pending"
        elif verified == target:
            status = "Match"
        elif verified > target:
            status = f"Surplus (+{diff})"
        else:
            status = f"Partial (-{abs(pending)})"

        res.append({
            "id": i.id,
            "party": item_party,
            "order_no": str(i.data.get(order_col, f"Order_{i.id}")).strip(),
            "ready_pcs": target,
            "verified_pcs": verified,
            "pending_pcs": pending,
            "difference": diff,
            "status": status,
            "is_extra": i.management_qty is None,
            "data": i.data
        })

    return res


@router.get("/fg/order/{item_id}")
async def get_fg_order_detail(item_id: int, db: AsyncSession = Depends(get_db)):
    """Single order detail with logged batches"""
    item_res = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = item_res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Order not found")

    dept_res = await db.execute(select(Department).where(Department.id == item.department_id))
    dept = dept_res.scalars().first()
    party_col = dept.party_col or "PARTY" if dept else "PARTY"
    order_col = dept.order_col or "ORDER NO" if dept else "ORDER NO"

    batches_res = await db.execute(
        select(StockBatch).where(StockBatch.stock_item_id == item_id).order_by(StockBatch.created_at.desc())
    )
    batches = batches_res.scalars().all()

    batch_list = [
        {
            "id": b.id,
            "entry_no": b.id,
            "bales": b.bales,
            "pcs_per_bale": b.pcs_per_bale,
            "loose_pcs": b.loose_pcs,
            "total_pcs": b.total_pcs,
            "verified_by": b.verified_by,
            "remark": b.remark,
            "created_at": b.created_at.isoformat() if b.created_at else None
        }
        for b in batches
    ]

    total_verified = sum(b["total_pcs"] for b in batch_list)
    target = item.management_qty or 0.0
    pending = target - total_verified
    diff = total_verified - target

    return {
        "id": item.id,
        "party": str(item.data.get(party_col, "")).strip(),
        "order_no": str(item.data.get(order_col, f"Order_{item.id}")).strip(),
        "ready_pcs": target,
        "verified_pcs": total_verified,
        "pending_pcs": pending,
        "difference": diff,
        "data": item.data,
        "batches": batch_list
    }


@router.post("/fg/order/{item_id}/verify")
async def add_fg_batch(item_id: int, req: FGBatchAddRequest, db: AsyncSession = Depends(get_db)):
    """Pass physical verification batch entry for a Finish Goods order"""
    if req.bales < 0 or req.pcs_per_bale < 0 or req.loose_pcs < 0:
        raise HTTPException(status_code=400, detail="Bales and loose pieces cannot be negative")

    total_pcs = (req.bales * req.pcs_per_bale) + req.loose_pcs
    if total_pcs <= 0:
        raise HTTPException(status_code=400, detail="Total verified pcs must be greater than 0")

    item_res = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = item_res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Order not found")

    dept_res = await db.execute(select(Department).where(Department.id == item.department_id))
    dept = dept_res.scalars().first()
    party_col = dept.party_col or "PARTY" if dept else "PARTY"
    order_col = dept.order_col or "ORDER NO" if dept else "ORDER NO"

    batch = StockBatch(
        department_id=item.department_id,
        stock_item_id=item_id,
        bales=req.bales,
        pcs_per_bale=req.pcs_per_bale,
        loose_pcs=req.loose_pcs,
        total_pcs=total_pcs,
        verified_by=req.verified_by,
        remark=req.remark or ""
    )
    db.add(batch)
    await db.flush()

    # Update item physical_qty and status
    batches_res = await db.execute(select(StockBatch).where(StockBatch.stock_item_id == item_id))
    all_batches = batches_res.scalars().all()
    item.physical_qty = float(sum(b.total_pcs for b in all_batches))
    item.verified = True
    item.verified_by = req.verified_by
    item.verified_at = datetime.now(timezone.utc)
    await db.commit()

    order_no = str(item.data.get(order_col, f"Order_{item.id}")).strip()
    party = str(item.data.get(party_col, "")).strip()

    return {
        "message": f"Added Entry #{batch.id}: {total_pcs} pcs verified",
        "entry_no": batch.id,
        "bales": req.bales,
        "pcs_per_bale": req.pcs_per_bale,
        "loose_pcs": req.loose_pcs,
        "total_pcs": total_pcs,
        "order_no": order_no,
        "party": party,
        "verified_by": req.verified_by
    }


@router.delete("/fg/batch/{batch_id}")
async def delete_fg_batch(batch_id: int, db: AsyncSession = Depends(get_db)):
    """Delete batch entry for correction/undo and recalculate balance"""
    batch_res = await db.execute(select(StockBatch).where(StockBatch.id == batch_id))
    batch = batch_res.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    stock_item_id = batch.stock_item_id
    total_pcs = batch.total_pcs

    await db.delete(batch)
    await db.flush()

    # Recalculate remaining physical_qty on item
    remaining_res = await db.execute(select(StockBatch).where(StockBatch.stock_item_id == stock_item_id))
    remaining = remaining_res.scalars().all()
    item_res = await db.execute(select(StockItem).where(StockItem.id == stock_item_id))
    item = item_res.scalars().first()
    if item:
        rem_sum = sum(b.total_pcs for b in remaining)
        item.physical_qty = float(rem_sum) if rem_sum > 0 else None
        item.verified = bool(rem_sum > 0)
        if rem_sum == 0:
            item.verified_by = None
            item.verified_at = None

    await db.commit()
    return {"message": f"Deleted Entry #{batch_id} ({total_pcs} pcs)"}


@router.get("/fg/{dept_id}/log")
async def get_fg_audit_log(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Master serial audit log for Finish Goods, ordered descending"""
    dept_res = await db.execute(select(Department).where(Department.id == dept_id))
    dept = dept_res.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    party_col = dept.party_col or "PARTY"
    order_col = dept.order_col or "ORDER NO"

    batches_res = await db.execute(
        select(StockBatch).where(StockBatch.department_id == dept_id).order_by(StockBatch.id.desc())
    )
    batches = batches_res.scalars().all()

    items_res = await db.execute(select(StockItem).where(StockItem.department_id == dept_id))
    items = items_res.scalars().all()
    item_map = {i.id: i for i in items}

    res = []
    for b in batches:
        item = item_map.get(b.stock_item_id)
        i_data = item.data if item else {}
        res.append({
            "entry_no": b.id,
            "id": b.id,
            "item_id": b.stock_item_id,
            "party": str(i_data.get(party_col, "—")).strip(),
            "order_no": str(i_data.get(order_col, "—")).strip(),
            "bales": b.bales,
            "pcs_per_bale": b.pcs_per_bale,
            "loose_pcs": b.loose_pcs,
            "total_pcs": b.total_pcs,
            "verified_by": b.verified_by,
            "remark": b.remark,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "bag_size": i_data.get("BAG SIZE", "—"),
            "type": i_data.get("TYPE", "—")
        })

    return res
