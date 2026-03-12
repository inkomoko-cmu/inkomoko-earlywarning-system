from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import _build_engine
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import MeResponse
from app.crud.auth import get_user_by_email, get_user_roles
from app.core.security import verify_password, create_access_token
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    email = payload.email.lower().strip()

    # DEBUG MODE: Allow "admin@admin.com"/"admin" bypass — no DB needed
    if email == "admin@admin.com" and payload.password == "admin":
        print("🔓 DEBUG MODE: Admin bypass authenticated")
        token = create_access_token(
            {"sub": "debug-admin", "email": "admin@admin.com", "roles": ["admin"]}
        )
        return TokenResponse(access_token=token)

    # For real users, open a DB session only now
    async with _build_engine()() as db:
        user = await get_user_by_email(db, email)
        print(f"Login attempt for email: {email}, user found: {user is not None}")
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        roles = await get_user_roles(db, user.user_id)
        token = create_access_token(
            {"sub": str(user.user_id), "email": user.email, "roles": roles}
        )
        return TokenResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
async def me(current=Depends(get_current_user)):
    user, roles = current
    return MeResponse(
        user_id=str(user.user_id),
        email=user.email,
        full_name=user.full_name,
        roles=roles,
    )
