from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.rbac import router as rbac_router
from app.api.routes.data import router as data_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.health import router as health_router
from app.api.routes.ml import router as ml_router
from app.api.routes.audit import router as audit_router
from fastapi import Request

from app.core.config import settings
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.ml import load_models
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models at startup and cleanup on shutdown."""
    logger.info("🚀 Starting up - loading ML models...")
    try:
        load_models()
        logger.info("✅ ML models loaded successfully")
    except Exception as e:
        logger.warning(f"⚠️ Could not load ML models: {e}")
        logger.warning("Models may need training. Run POST /ml/train")

    yield

    logger.info("🛑 Shutting down")


app = FastAPI(title="Inkomoko Intelligence Suite API", lifespan=lifespan)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rbac_router)
app.include_router(data_router)
app.include_router(portfolio_router)
app.include_router(health_router)
app.include_router(ml_router)
app.include_router(audit_router)


@app.get("/debug/token")
async def debug_token(request: Request):
    """Debug endpoint to check token being received."""
    auth_header = request.headers.get("Authorization")
    return {
        "auth_header": auth_header,
        "has_token": auth_header is not None,
        "token_preview": auth_header[:50] if auth_header else None,
    }
