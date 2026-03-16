import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.api.deps import require_roles
from app.schemas.user import CreateUserRequest, UpdateUserStatusRequest, UserListItem
from app.crud.user import create_user_with_roles
from app.crud.auth import get_user_roles
from app.models.auth import AuthRole, AuthUser

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserListItem], dependencies=[Depends(require_roles("admin"))])
async def list_users(db: AsyncSession = Depends(get_db)):
    users_res = await db.execute(select(AuthUser).order_by(AuthUser.email))
    users = users_res.scalars().all()

    rows: list[UserListItem] = []
    for user in users:
        roles = await get_user_roles(db, user.user_id)
        rows.append(
            UserListItem(
                user_id=str(user.user_id),
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                roles=roles,
            )
        )
    return rows

@router.post("", dependencies=[Depends(require_roles("admin"))])
async def create_user(payload: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    # Validate role keys exist (avoid silent failures)
    q = select(AuthRole.role_key).where(AuthRole.role_key.in_(payload.roles))
    res = await db.execute(q)
    found = {r[0] for r in res.all()}
    missing = [r for r in payload.roles if r not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown role(s): {missing}")

    try:
        user = await create_user_with_roles(
            db=db,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            roles=payload.roles,
        )
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already exists or constraint failed")

    roles = await get_user_roles(db, user.user_id)
    return {
        "user_id": str(user.user_id),
        "email": user.email,
        "full_name": user.full_name,
        "roles": roles,
    }


@router.patch("/{user_id}/status", response_model=UserListItem, dependencies=[Depends(require_roles("admin"))])
async def update_user_status(user_id: str, payload: UpdateUserStatusRequest, db: AsyncSession = Depends(get_db)):
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")

    user_res = await db.execute(select(AuthUser).where(AuthUser.user_id == user_uuid))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = payload.is_active
    await db.commit()
    await db.refresh(user)
    roles = await get_user_roles(db, user.user_id)

    return UserListItem(
        user_id=str(user.user_id),
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=roles,
    )
