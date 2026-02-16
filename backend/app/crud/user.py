import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.auth import AuthUser, AuthRole, AuthUserRole
from app.core.security import hash_password

async def create_user_with_roles(
    db: AsyncSession,
    email: str,
    password: str,
    full_name: str | None,
    roles: list[str],
) -> AuthUser:
    user = AuthUser(
        user_id=uuid.uuid4(),
        email=email.lower().strip(),
        full_name=full_name,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    q = select(AuthRole).where(AuthRole.role_key.in_(roles))
    res = await db.execute(q)
    role_rows = res.scalars().all()

    for r in role_rows:
        db.add(AuthUserRole(user_id=user.user_id, role_id=r.role_id))

    await db.commit()
    await db.refresh(user)
    return user
