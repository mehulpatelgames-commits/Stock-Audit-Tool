from fastapi import APIRouter, HTTPException
from schemas import LoginRequest, LoginResponse
from config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_USERS = [
    "Jay Samani", "Mehul Surani", "Krutik Patel",
    "Hardik Surani", "Sidharth Varyani", "Deepak Kumar", "Admin"
]


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    is_admin = name in settings.admin_list
    return LoginResponse(name=name, is_admin=is_admin)


@router.get("/users")
async def get_users():
    """Return list of valid user names for the login dropdown"""
    return {"users": VALID_USERS}
