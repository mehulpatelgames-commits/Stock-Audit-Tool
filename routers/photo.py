from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import PhotoLog
from services.drive import upload_to_drive

router = APIRouter(prefix="/api/photo", tags=["photo"])


@router.post("/upload")
async def upload_photo(
    file: UploadFile = File(...),
    uploaded_by: str = Form(...),
    remark: str = Form(default=""),
    department_id: int = Form(default=None),
    db: AsyncSession = Depends(get_db)
):
    """Upload photo to Google Drive and log it in DB"""
    if file.size and file.size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB allowed.")

    contents = await file.read()

    try:
        file_url = await upload_to_drive(contents, file.filename, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    log = PhotoLog(
        department_id=department_id,
        file_url=file_url,
        file_name=file.filename,
        uploaded_by=uploaded_by,
        remark=remark
    )
    db.add(log)
    await db.commit()

    return {"message": "Uploaded Successfully", "file_url": file_url}
