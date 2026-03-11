from fastapi import APIRouter
from pydantic import BaseModel

from app.db.mongo import check_mongodb_connection

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    mongo_connected: bool


@router.get("/", response_model=HealthResponse)
async def health_check():
    """Check system health including MongoDB connectivity."""
    mongo_ok = check_mongodb_connection()
    status = "healthy" if mongo_ok else "degraded"
    return HealthResponse(status=status, mongo_connected=mongo_ok)
