from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── AUTH ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    name: str

class LoginResponse(BaseModel):
    name: str
    is_admin: bool


# ── AUDIT ─────────────────────────────────────────────
class AuditCreate(BaseModel):
    name: str

class AuditOut(BaseModel):
    id: int
    name: str
    status: str
    created_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── DEPARTMENT ────────────────────────────────────────
class DepartmentCreate(BaseModel):
    name: str
    audit_id: int

class DepartmentOut(BaseModel):
    id: int
    audit_id: int
    name: str
    columns: List[str]
    filter_columns: List[str]
    total_items: Optional[int] = 0
    verified_items: Optional[int] = 0

    class Config:
        from_attributes = True


# ── STOCK ITEM ────────────────────────────────────────
class StockItemOut(BaseModel):
    id: int
    department_id: int
    data: Dict[str, Any]
    management_qty: Optional[float]
    physical_qty: Optional[float]
    remark: Optional[str]
    verified: bool
    verified_by: Optional[str]
    verified_at: Optional[datetime]
    being_edited_by: Optional[str]

    class Config:
        from_attributes = True

class StockUpdateRequest(BaseModel):
    physical_qty: float
    remark: Optional[str] = ""
    verified_by: str

class EditLockRequest(BaseModel):
    user_name: str
    action: str  # "lock" | "unlock"

class FilterColumnsUpdate(BaseModel):
    filter_columns: List[str]


# ── PHOTO ─────────────────────────────────────────────
class PhotoUploadResponse(BaseModel):
    file_url: str
    message: str


# ── EXPORT ────────────────────────────────────────────
class ExportRequest(BaseModel):
    department_id: int
