from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import Audit, Department
from schemas import AuditCreate, AuditOut

router = APIRouter(prefix="/api/audits", tags=["audits"])


@router.post("/", response_model=AuditOut)
async def create_audit(data: AuditCreate, created_by: str, db: AsyncSession = Depends(get_db)):
    audit = Audit(name=data.name, created_by=created_by)
    db.add(audit)
    await db.commit()
    await db.refresh(audit)
    return audit


@router.get("/", response_model=list[AuditOut])
async def list_audits(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Audit).order_by(Audit.created_at.desc()))
    return result.scalars().all()


@router.get("/active", response_model=AuditOut)
async def get_active_audit(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Audit).where(Audit.status == "active").order_by(Audit.created_at.desc()))
    audit = result.scalars().first()
    if not audit:
        raise HTTPException(status_code=404, detail="No active audit found")
    return audit


@router.patch("/{audit_id}/close")
async def close_audit(audit_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Audit).where(Audit.id == audit_id))
    audit = result.scalars().first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    audit.status = "closed"
    await db.commit()
    return {"message": "Audit closed"}
