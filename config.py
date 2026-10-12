from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key"
    ADMIN_NAMES: str = "Admin"
    GOOGLE_SA_JSON: str = ""
    DRIVE_FOLDER_ID: str = ""

    @property
    def async_database_url(self) -> str:
        import os
        import re

        # Read directly from env or field
        raw = os.environ.get("DATABASE_URL") or self.DATABASE_URL or ""
        url = str(raw).strip().strip("'\"")

        print(f"[DATABASE_CONFIG] Raw DATABASE_URL length: {len(url)}, starts with: {url[:20] if len(url)>=20 else url}")

        # If empty or not set, raise clear informative error
        if not url:
            raise ValueError("[DATABASE_CONFIG] DATABASE_URL environment variable is empty or not set.")

        # If literal template variable was passed instead of resolved value
        if "${{" in url or "$Postgres" in url:
            raise ValueError(f"[DATABASE_CONFIG] DATABASE_URL contains unresolved template expression: {url}")

        # Convert dialect for SQLAlchemy asyncpg
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        return url

    @property
    def admin_list(self) -> List[str]:
        return [name.strip() for name in self.ADMIN_NAMES.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
