from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str = "dev-secret-key"
    ADMIN_NAMES: str = "Admin"
    GOOGLE_SA_JSON: str = ""
    DRIVE_FOLDER_ID: str = ""

    @property
    def admin_list(self) -> List[str]:
        return [name.strip() for name in self.ADMIN_NAMES.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
