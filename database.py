from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(settings.async_database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    import models  # Register all ORM models with Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe column migration for departments table
        try:
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS verification_method VARCHAR DEFAULT 'general';"))
            await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS party_col VARCHAR;"))
            await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS order_col VARCHAR;"))
            await conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS ready_qty_col VARCHAR;"))
        except Exception:
            pass

    # Seed default staff/admin users if database is fresh
    from models import AppUser
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AppUser).limit(1))
        if not result.scalars().first():
            default_users = [
                AppUser(name="Jay Samani", username="jaysamani", password="123", is_admin=True),
                AppUser(name="Admin", username="admin", password="123", is_admin=True),
                AppUser(name="Mehul Surani", username="mehulsurani", password="123", is_admin=False),
                AppUser(name="Krutik Patel", username="krutikpatel", password="123", is_admin=False),
                AppUser(name="Hardik Surani", username="hardiksurani", password="123", is_admin=False),
                AppUser(name="Sidharth Varyani", username="sidharthvaryani", password="123", is_admin=False),
                AppUser(name="Deepak Kumar", username="deepakkumar", password="123", is_admin=False),
            ]
            session.add_all(default_users)
            await session.commit()
