from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException
from app.core.config import settings

# Engine is created lazily on first use — no connection at import time
_engine = None
_session_factory = None


def _build_engine():
    """Return the session factory, creating the engine on first call."""
    global _engine, _session_factory
    if _session_factory is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=False,
        )
        _session_factory = sessionmaker(
            bind=_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db():
    factory = _build_engine()
    try:
        async with factory() as session:
            yield session
    except Exception as exc:
        # Connection refused or DB unavailable — return 503 instead of 500/crash
        if "Connection refused" in str(exc) or "connect" in str(exc).lower():
            raise HTTPException(status_code=503, detail="Database unavailable")
        raise
