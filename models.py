from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class AppUser(Base):
    """Staff members who can log in — managed by Admin"""
    __tablename__ = "app_users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    username   = Column(String, nullable=False, unique=True, index=True)
    password   = Column(String, nullable=False, default="123")
    is_admin   = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())



class Audit(Base):
    """A single stock audit session (e.g. Q3 2026 Audit)"""
    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="active")  # active | closed
    created_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    departments = relationship("Department", back_populates="audit", cascade="all, delete-orphan")


class Department(Base):
    """A department within an audit (e.g. Fabric, Yarn, Finished Goods)"""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id"), nullable=False)
    name = Column(String, nullable=False)
    columns = Column(JSON, default=list)       # All column names detected from Excel
    filter_columns = Column(JSON, default=list)  # Subset of columns available for filtering
    verification_method = Column(String, default="general")  # 'general' | 'finish_goods'
    party_col = Column(String, nullable=True)
    order_col = Column(String, nullable=True)
    ready_qty_col = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    audit = relationship("Audit", back_populates="departments")
    stock_items = relationship("StockItem", back_populates="department", cascade="all, delete-orphan")
    photo_logs = relationship("PhotoLog", back_populates="department", cascade="all, delete-orphan")
    batches = relationship("StockBatch", back_populates="department", cascade="all, delete-orphan")


class StockItem(Base):
    """A single stock line item (one roll, one product, etc.)"""
    __tablename__ = "stock_items"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)

    # Flexible storage — all Excel columns stored as JSON
    data = Column(JSON, nullable=False, default=dict)

    # Management quantity (imported from Excel)
    management_qty = Column(Float, nullable=True)

    # Audit result fields
    physical_qty = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)
    verified = Column(Boolean, default=False)
    verified_by = Column(String, nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    # Concurrent edit tracking — who is currently editing this item
    being_edited_by = Column(String, nullable=True)
    edit_started_at = Column(DateTime(timezone=True), nullable=True)

    department = relationship("Department", back_populates="stock_items")
    photos     = relationship("PhotoLog",   back_populates="stock_item")
    batches    = relationship("StockBatch", back_populates="stock_item", cascade="all, delete-orphan")


class StockBatch(Base):
    """A physical verification batch entry for Finish Goods (serially numbered across the department)"""
    __tablename__ = "stock_batches"

    id            = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    stock_item_id = Column(Integer, ForeignKey("stock_items.id", ondelete="CASCADE"), nullable=False)
    bales         = Column(Integer, default=0)
    pcs_per_bale  = Column(Integer, default=0)
    loose_pcs     = Column(Integer, default=0)
    total_pcs     = Column(Integer, nullable=False)
    verified_by   = Column(String, nullable=False)
    remark        = Column(Text, nullable=True, default="")
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    department = relationship("Department", back_populates="batches")
    stock_item = relationship("StockItem", back_populates="batches")


class PhotoLog(Base):
    """A photo taken during audit, uploaded to Google Drive or stored locally"""
    __tablename__ = "photo_log"

    id            = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    stock_item_id = Column(Integer, ForeignKey("stock_items.id"), nullable=True)  # linked stock entry
    file_url      = Column(String, nullable=False)   # local /static/uploads/... or Drive link
    file_name     = Column(String)
    uploaded_by   = Column(String, nullable=False)
    remark        = Column(Text, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    department = relationship("Department", back_populates="photo_logs")
    stock_item = relationship("StockItem",  back_populates="photos")
