from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.scope import AuthScope

async def get_user_scopes(db: AsyncSession, user_id):
    q = select(AuthScope).where(AuthScope.user_id == user_id)
    res = await db.execute(q)
    return res.scalars().all()
