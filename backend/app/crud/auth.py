from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.auth import AuthUser, AuthRole, AuthUserRole

async def get_user_by_email(db: AsyncSession, email: str) -> AuthUser | None:
    q = select(AuthUser).where(AuthUser.email == email)
    res = await db.execute(q)
    return res.scalar_one_or_none()

async def get_user_roles(db: AsyncSession, user_id) -> list[str]:
    q = (
        select(AuthRole.role_key)
        .join(AuthUserRole, AuthUserRole.role_id == AuthRole.role_id)
        .where(AuthUserRole.user_id == user_id)
    )
    res = await db.execute(q)
    return [r[0] for r in res.all()]
