from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.rbac import router as rbac_router
from app.api.routes.data import router as data_router
from app.api.routes.portfolio import router as portfolio_router
from app.api.routes.health import router as health_router
from app.api.routes.ml import router as ml_router
from app.api.routes.audit import router as audit_router
from app.api.routes.settings import router as settings_router
from app.api.routes.scenarios import router as scenarios_router
from fastapi import Request

from app.core.config import settings
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.ml import load_models
from app.db.bootstrap import ensure_settings_tables
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models at startup and cleanup on shutdown."""
    logger.info("🚀 Starting up - loading ML models...")
    try:
        await ensure_settings_tables()
        logger.info("✅ Settings table bootstrap complete")
    except Exception as e:
        logger.warning(f"⚠️ Settings bootstrap failed: {e}")

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

cors_kwargs = {
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "allow_credentials": True,
}

if settings.DEBUG_MODE:
    # In debug, allow LAN/dev origins (e.g. 10.x.x.x frontend hosts) for preflight.
    cors_kwargs["allow_origin_regex"] = r"^https?://.*$"
    cors_kwargs["allow_origins"] = origins
else:
    cors_kwargs["allow_origins"] = origins

app.add_middleware(CORSMiddleware, **cors_kwargs)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rbac_router)
app.include_router(data_router)
app.include_router(portfolio_router)
app.include_router(health_router)
app.include_router(ml_router)
app.include_router(audit_router)
app.include_router(settings_router)
app.include_router(scenarios_router)


@app.get("/debug/token")
async def debug_token(request: Request):
    """Debug endpoint to check token being received."""
    auth_header = request.headers.get("Authorization")
    return {
        "auth_header": auth_header,
        "has_token": auth_header is not None,
        "token_preview": auth_header[:50] if auth_header else None,
    }
