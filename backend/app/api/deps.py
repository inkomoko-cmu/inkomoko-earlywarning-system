from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.scope import get_user_scopes
import uuid

from app.core.config import settings
from app.db.session import get_db, _build_engine
from app.crud.auth import get_user_by_email, get_user_roles
from app.models.auth import AuthUser

bearer = HTTPBearer()


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
):
    token = creds.credentials

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        email = payload.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        # DEBUG MODE: Return mock admin without hitting the database
        if email == "admin@admin.com":
            mock_user = AuthUser(
                user_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
                email="admin@admin.com",
                full_name="Debug Admin",
                password_hash="",
                is_active=True,
            )
            return mock_user, payload.get("roles", ["admin"])

        # For real users, open a DB session only now
        async with _build_engine()() as db:
            user = await get_user_by_email(db, email=email)
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=401, detail="User not found or inactive"
                )
            roles = await get_user_roles(db, user.user_id)
            return user, roles
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_roles(*allowed: str):
    async def _guard(current=Depends(get_current_user)):
        user, roles = current
        if "admin" in roles:
            return user, roles
        if not any(r in roles for r in allowed):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user, roles

    return _guard


def _match_scope(scope_row, country_code, program_id, cohort_id) -> bool:
    if (
        scope_row.country_code is not None
        and country_code is not None
        and scope_row.country_code != country_code
    ):
        return False
    if (
        scope_row.program_id is not None
        and program_id is not None
        and scope_row.program_id != program_id
    ):
        return False
    if (
        scope_row.cohort_id is not None
        and cohort_id is not None
        and scope_row.cohort_id != cohort_id
    ):
        return False
    return True


def require_scope(country_code: str | None = None, program_id=None, cohort_id=None):
    async def _guard(
        current=Depends(get_current_user), db: AsyncSession = Depends(get_db)
    ):
        user, roles = current
        if "admin" in roles:
            return user, roles

        scopes = await get_user_scopes(db, user.user_id)
        if not scopes:
            raise HTTPException(status_code=403, detail="No scope assigned")

        ok = any(_match_scope(s, country_code, program_id, cohort_id) for s in scopes)
        if not ok:
            raise HTTPException(status_code=403, detail="Out of scope")
        return user, roles

    return _guard
