from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── AUTH ──────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    name: str
    username: str
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
    verification_method: Optional[str] = "general"
    party_col: Optional[str] = None
    order_col: Optional[str] = None
    ready_qty_col: Optional[str] = None
    total_items: Optional[int] = 0
    verified_items: Optional[int] = 0

    class Config:
        from_attributes = True


# ── FINISH GOODS BATCH ────────────────────────────────
class FGBatchAddRequest(BaseModel):
    bales: int = 0
    pcs_per_bale: int = 0
    loose_pcs: int = 0
    verified_by: str
    remark: Optional[str] = ""

class FGBatchOut(BaseModel):
    id: int
    entry_no: int
    department_id: int
    stock_item_id: int
    bales: int
    pcs_per_bale: int
    loose_pcs: int
    total_pcs: int
    verified_by: str
    remark: Optional[str] = ""
    created_at: datetime

    class Config:
        from_attributes = True


# ── STOCK ITEM ────────────────────────────────────────
class PhotoOut(BaseModel):
    id: int
    file_url: str
    file_name: Optional[str] = None
    remark: Optional[str] = None
    uploaded_by: Optional[str] = None

    class Config:
        from_attributes = True

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
    photos: List[PhotoOut] = []

    class Config:
        from_attributes = True

class StockUpdateRequest(BaseModel):
    physical_qty: float
    remark: Optional[str] = ""
    verified_by: str

class BulkVerifyManagementRequest(BaseModel):
    department_id: int
    item_ids: List[int]
    verified_by: str
    remark: Optional[str] = "Bulk verified as per management qty"
    overwrite_verified: Optional[bool] = False

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
