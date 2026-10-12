from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from database import get_db
from models import PhotoLog
from services.drive import upload_photo

router = APIRouter(prefix="/api/photo", tags=["photo"])


@router.post("/upload")
async def upload_photo_endpoint(
    file:           UploadFile    = File(...),
    uploaded_by:    str           = Form(...),
    remark:         str           = Form(default=""),
    department_id:  Optional[int] = Form(default=None),
    stock_item_id:  Optional[int] = Form(default=None),
    db:             AsyncSession  = Depends(get_db)
):
    """Upload photo — saves locally (dev) or to Google Drive (prod), logs in DB."""
    contents = await file.read()

    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 100MB allowed.")

    try:
        file_url = await upload_photo(contents, file.filename or "photo.jpg", file.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    log = PhotoLog(
        department_id = department_id,
        stock_item_id = stock_item_id,
        file_url      = file_url,
        file_name     = file.filename,
        uploaded_by   = uploaded_by,
        remark        = remark
    )
    db.add(log)
    await db.commit()

    return {"message": "Uploaded successfully", "file_url": file_url}
