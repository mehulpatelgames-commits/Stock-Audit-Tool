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
        url = (self.DATABASE_URL or "").strip().strip("'\"")
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
