from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.crud.settings import DEFAULT_SETTINGS, get_or_create_settings, serialize_settings, update_settings
from app.schemas.settings import SettingsResponse, SettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse, dependencies=[Depends(require_roles("admin"))])
async def get_settings(db: AsyncSession = Depends(get_db)):
    settings = await get_or_create_settings(db)
    return serialize_settings(settings)


@router.put("", response_model=SettingsResponse, dependencies=[Depends(require_roles("admin"))])
async def save_settings(
    payload: SettingsUpdateRequest,
    current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user, _ = current
    # Skip debug user's nil UUID to avoid foreign key constraint violation
    is_debug_user = user and user.email == "admin@admin.com"
    settings = await update_settings(
        db,
        updates=payload.model_dump(exclude_none=True),
        updated_by=None if is_debug_user else (user.user_id if user else None),
    )
    return serialize_settings(settings)


@router.post("/reset", response_model=SettingsResponse, dependencies=[Depends(require_roles("admin"))])
async def reset_settings(
    current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user, _ = current
    # Skip debug user's nil UUID to avoid foreign key constraint violation
    is_debug_user = user and user.email == "admin@admin.com"
    settings = await update_settings(
        db,
        updates=DEFAULT_SETTINGS,
        updated_by=None if is_debug_user else (user.user_id if user else None),
    )
    return serialize_settings(settings)
