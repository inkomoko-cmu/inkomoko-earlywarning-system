from __future__ import annotations

from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.ai_insights_service import compute_context_hash
from app.core.config import settings
from app.crud.ai_insights import (
    enqueue_job_if_missing,
    get_job,
    get_latest_snapshot,
    get_latest_snapshot_any_context,
    snapshot_is_fresh,
)
from app.db.session import get_db
from app.schemas.ai_insights import (
    AiInsightJobStatusResponse,
    AiInsightsGetResponse,
    AiInsightsRefreshRequest,
    AiInsightsRefreshResponse,
)

router = APIRouter(prefix="/ai-insights", tags=["ai-insights"])


@router.get("")
async def get_ai_insights(
    scope_type: str = Query(...),
    scope_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current=Depends(get_current_user),
) -> AiInsightsGetResponse:
    snapshot = await get_latest_snapshot_any_context(db, scope_type=scope_type, scope_id=scope_id)
    if not snapshot:
        return AiInsightsGetResponse(status="missing", stale=True, insights=[])

    return AiInsightsGetResponse(
        status="ready",
        stale=not snapshot_is_fresh(snapshot),
        generated_at=snapshot.generated_at.isoformat() if snapshot.generated_at else None,
        insights=snapshot.payload_json.get("insights", []),
    )


@router.post("/refresh")
async def refresh_ai_insights(
    payload: AiInsightsRefreshRequest,
    db: AsyncSession = Depends(get_db),
    current=Depends(get_current_user),
) -> AiInsightsRefreshResponse:
    user, _roles = current

    context_hash = compute_context_hash(payload.scope_type, payload.scope_id, payload.context)
    snapshot = await get_latest_snapshot(
        db,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        context_hash=context_hash,
        prompt_version=settings.AI_PROMPT_VERSION,
    )

    if snapshot and snapshot_is_fresh(snapshot) and not payload.force_refresh:
        return AiInsightsRefreshResponse(
            status="ready",
            stale=False,
            generated_at=snapshot.generated_at.isoformat() if snapshot.generated_at else None,
            insights=snapshot.payload_json.get("insights", []),
        )

    requested_by = None
    if user and getattr(user, "email", None) != "admin@admin.com":
        requested_by = user.user_id

    job = await enqueue_job_if_missing(
        db,
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        context_hash=context_hash,
        model_name=settings.LLM_MODEL,
        prompt_version=settings.AI_PROMPT_VERSION,
        context_json=payload.context,
        requested_by=requested_by,
    )

    stale_insights = snapshot.payload_json.get("insights", []) if snapshot else []
    return AiInsightsRefreshResponse(
        status=job.status,
        stale=True,
        job_id=str(job.job_id),
        generated_at=snapshot.generated_at.isoformat() if snapshot and snapshot.generated_at else None,
        insights=stale_insights,
    )


@router.get("/jobs/{job_id}")
async def get_ai_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _current=Depends(get_current_user),
) -> AiInsightJobStatusResponse:
    try:
        parsed = uuid.UUID(job_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid job_id")

    job = await get_job(db, parsed)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return AiInsightJobStatusResponse(
        job_id=str(job.job_id),
        status=job.status,
        attempts=job.attempts,
        error_message=job.error_message,
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )
