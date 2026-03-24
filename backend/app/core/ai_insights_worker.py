from __future__ import annotations

import asyncio
import logging

from app.core.ai_insights_service import generate_ai_insights
from app.core.config import settings
from app.crud.ai_insights import (
    claim_next_job,
    mark_job_done,
    mark_job_failed,
    upsert_snapshot,
)
from app.db.session import _build_engine

logger = logging.getLogger(__name__)


async def process_one_ai_job() -> bool:
    factory = _build_engine()
    async with factory() as db:
        job = await claim_next_job(db)

    if not job:
        return False

    try:
        payload = await generate_ai_insights(job.scope_type, job.scope_id, job.context_json)

        async with factory() as db:
            await upsert_snapshot(
                db,
                scope_type=job.scope_type,
                scope_id=job.scope_id,
                context_hash=job.context_hash,
                model_name=job.model_name,
                prompt_version=job.prompt_version,
                payload_json=payload,
                ttl_seconds=settings.AI_INSIGHTS_TTL_SECONDS,
                status="ready",
            )
            await mark_job_done(db, job.job_id)

    except Exception as e:
        logger.exception("AI insights job failed: %s", e)
        async with factory() as db:
            await mark_job_failed(db, job.job_id, str(e))

    return True


async def run_ai_worker_loop(stop_event: asyncio.Event) -> None:
    logger.info("AI insights worker started")
    idle_sleep = max(1, settings.AI_WORKER_IDLE_SECONDS)
    busy_sleep = max(0, settings.AI_WORKER_BUSY_PAUSE_SECONDS)

    while not stop_event.is_set():
        processed = await process_one_ai_job()
        if processed:
            await asyncio.sleep(busy_sleep)
        else:
            await asyncio.sleep(idle_sleep)

    logger.info("AI insights worker stopped")
