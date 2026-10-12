from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = ""
    SECRET_KEY: str = "dev-secret-key"
    ADMIN_NAMES: str = "Admin"
    GOOGLE_SA_JSON: str = ""
    DRIVE_FOLDER_ID: str = ""

    @property
    def async_database_url(self) -> str:
        import os
        import re

        # Read from any available PostgreSQL environment variable provided by Railway/hosting
        raw = (
            os.environ.get("DATABASE_URL")
            or os.environ.get("DATABASE_PRIVATE_URL")
            or os.environ.get("DATABASE_PUBLIC_URL")
            or os.environ.get("POSTGRES_URL")
            or self.DATABASE_URL
            or ""
        )

        # If not provided as a full URL, assemble from individual PG variables if available
        if not raw and os.environ.get("PGHOST"):
            user = os.environ.get("PGUSER", "postgres")
            password = os.environ.get("PGPASSWORD", "")
            host = os.environ.get("PGHOST", "localhost")
            port = os.environ.get("PGPORT", "5432")
            dbname = os.environ.get("PGDATABASE", "railway")
            raw = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"

        url = str(raw).strip().strip("'\"")

        print(f"[DATABASE_CONFIG] Resolved URL starts with: {url[:25] if len(url)>=25 else url}")

        if not url:
            raise ValueError("[DATABASE_CONFIG] No database connection string found in environment.")

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
