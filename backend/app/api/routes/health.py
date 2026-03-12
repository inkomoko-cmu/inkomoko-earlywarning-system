from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    postgres_connected: bool
    debug_mode: bool


@router.get("/", response_model=HealthResponse)
async def health_check():
    """Check system health."""
    if settings.DEBUG_MODE:
        return HealthResponse(status="debug", postgres_connected=False, debug_mode=True)

    # Try a real DB ping only when not in debug mode
    try:
        from app.db.session import _build_engine
        from sqlalchemy import text

        factory = _build_engine()
        async with factory() as session:
            await session.execute(text("SELECT 1"))
        postgres_ok = True
    except Exception:
        postgres_ok = False

    status = "healthy" if postgres_ok else "degraded"
    return HealthResponse(
        status=status, postgres_connected=postgres_ok, debug_mode=False
    )
