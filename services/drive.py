import json
import asyncio
import uuid
import os
from pathlib import Path
from config import settings

# Local uploads folder (used when Drive credentials are not configured)
UPLOAD_DIR = Path(__file__).parent.parent / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def _drive_configured() -> bool:
    """Return True only if Google SA JSON and Folder ID are both set."""
    return bool(settings.GOOGLE_SA_JSON and settings.GOOGLE_SA_JSON.strip() not in ("", "{}"))


def _save_locally(file_bytes: bytes, filename: str) -> str:
    """Save file to static/uploads/ and return the served URL path."""
    ext      = Path(filename).suffix or ".jpg"
    unique   = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / unique
    filepath.write_bytes(file_bytes)
    return f"/static/uploads/{unique}"   # served by FastAPI StaticFiles


def _upload_to_drive_sync(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Blocking Google Drive upload — runs in thread pool."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload
    import io

    sa_info     = json.loads(settings.GOOGLE_SA_JSON)
    credentials = service_account.Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    service     = build("drive", "v3", credentials=credentials, cache_discovery=False)

    folder_id = settings.DRIVE_FOLDER_ID
    file_metadata = {
        "name"   : filename,
        "parents": [folder_id] if folder_id else []
    }

    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=content_type, resumable=False)
    file  = service.files().create(
        body       = file_metadata,
        media_body = media,
        fields     = "id, webViewLink"
    ).execute()

    # Make readable by anyone with the link
    service.permissions().create(
        fileId = file["id"],
        body   = {"role": "reader", "type": "anyone"}
    ).execute()

    return file.get("webViewLink", "")


async def upload_photo(file_bytes: bytes, filename: str, content_type: str) -> str:
    """
    Upload photo — auto-selects storage:
      • Local testing  → static/uploads/  (no credentials needed)
      • Production     → Google Drive      (requires GOOGLE_SA_JSON + DRIVE_FOLDER_ID)
    Returns a URL string.
    """
    if _drive_configured():
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, _upload_to_drive_sync, file_bytes, filename, content_type
        )
    else:
        return _save_locally(file_bytes, filename)


# Keep old name as alias so existing imports still work
upload_to_drive = upload_photo
