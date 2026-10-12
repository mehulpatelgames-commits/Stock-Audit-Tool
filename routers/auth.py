from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import AppUser
from schemas import LoginRequest, LoginResponse
from config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Login ──────────────────────────────────────────────
@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    username = req.username.strip().lower()
    password = req.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and Password are required")

    result = await db.execute(
        select(AppUser).where(AppUser.username == username)
    )
    user = result.scalars().first()

    if not user or user.password != password:
        raise HTTPException(status_code=401, detail="Invalid Username or Password")

    is_admin = bool(user.is_admin or (user.name in settings.admin_list))
    return LoginResponse(name=user.name, username=user.username, is_admin=is_admin)


# ── Get all users (Admin view) ─────────────────────────
@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppUser).order_by(AppUser.is_admin.desc(), AppUser.name))
    users  = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "username": u.username,
                "password": u.password,
                "is_admin": u.is_admin
            }
            for u in users
        ]
    }


# ── Staff management (Admin only) ─────────────────────

class AddUserRequest(BaseModel):
    name:     str
    username: Optional[str] = None
    password: Optional[str] = "123"
    is_admin: Optional[bool] = False


@router.post("/users")
async def add_user(body: AddUserRequest, db: AsyncSession = Depends(get_db)):
    """Admin adds a new team member or admin"""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    username = (body.username or name.lower().replace(" ", "")).strip().lower()
    password = (body.password or "123").strip()

    # Check duplicate username
    existing_un = await db.execute(select(AppUser).where(AppUser.username == username))
    if existing_un.scalars().first():
        raise HTTPException(status_code=409, detail=f"Username '{username}' already exists. Please choose another username.")

    user = AppUser(
        name=name,
        username=username,
        password=password,
        is_admin=bool(body.is_admin)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "message": f"Added '{name}' ({username})",
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "password": user.password,
        "is_admin": user.is_admin
    }


@router.patch("/users/{user_id}")
async def update_user(user_id: int, body: AddUserRequest, db: AsyncSession = Depends(get_db)):
    """Admin edits a staff member's credentials or role"""
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user   = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    if body.username:
        new_un = body.username.strip().lower()
        if new_un != user.username:
            chk = await db.execute(select(AppUser).where(AppUser.username == new_un, AppUser.id != user_id))
            if chk.scalars().first():
                raise HTTPException(status_code=409, detail=f"Username '{new_un}' is already in use.")
            user.username = new_un

    if body.password:
        user.password = body.password.strip()

    user.name     = new_name
    if body.is_admin is not None:
        user.is_admin = bool(body.is_admin)

    await db.commit()
    return {
        "message": f"Updated '{new_name}'",
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "password": user.password,
        "is_admin": user.is_admin
    }


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Admin removes a staff member"""
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user   = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"message": f"Removed '{user.name}'"}
