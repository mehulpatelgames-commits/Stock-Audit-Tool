import json
import asyncio
from config import settings
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def _get_drive_service():
    sa_info = json.loads(settings.GOOGLE_SA_JSON)
    credentials = service_account.Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


async def upload_to_drive(file_bytes: bytes, filename: str, content_type: str) -> str:
    """Upload file to Google Drive and return the shareable URL"""
    def _upload():
        service = _get_drive_service()
        folder_id = settings.DRIVE_FOLDER_ID

        file_metadata = {
            "name": filename,
            "parents": [folder_id] if folder_id else []
        }

        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=content_type, resumable=False)
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink"
        ).execute()

        # Make it readable by anyone with the link
        service.permissions().create(
            fileId=file["id"],
            body={"role": "reader", "type": "anyone"}
        ).execute()

        return file.get("webViewLink", "")

    # Run the blocking Google API call in a thread pool
    loop = asyncio.get_event_loop()
    url = await loop.run_in_executor(None, _upload)
    return url
