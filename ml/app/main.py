"""FastAPI application — Inkomoko Early Warning System."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from app.config import get_settings
from app.models import load_models
from app.routers import demo, employment, health, revenue, risk, train

_TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load all ML models into memory."""
    logger.info("Loading ML models …")
    load_models()
    logger.info("Models ready — accepting requests")
    yield
    logger.info("Shutting down")


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Register routers ────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(risk.router)
app.include_router(employment.router)
app.include_router(revenue.router)
app.include_router(demo.router)
app.include_router(train.router)


# ── Landing page ────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def index():
    """Serve a simple landing page that introduces the system."""
    return (_TEMPLATE_DIR / "index.html").read_text(encoding="utf-8")
