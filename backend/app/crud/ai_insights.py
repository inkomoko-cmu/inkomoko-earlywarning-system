from __future__ import annotations

import datetime
import uuid
from typing import Any

from sqlalchemy import and_, desc, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_insights import AiInsightJob, AiInsightSnapshot


async def get_latest_snapshot(
    db: AsyncSession,
    scope_type: str,
    scope_id: str | None,
    context_hash: str,
    prompt_version: str,
) -> AiInsightSnapshot | None:
    stmt = (
        select(AiInsightSnapshot)
        .where(
            and_(
                AiInsightSnapshot.scope_type == scope_type,
                AiInsightSnapshot.scope_id == scope_id,
                AiInsightSnapshot.context_hash == context_hash,
                AiInsightSnapshot.prompt_version == prompt_version,
                AiInsightSnapshot.status == "ready",
            )
        )
        .order_by(desc(AiInsightSnapshot.generated_at))
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def get_latest_snapshot_any_context(
    db: AsyncSession,
    scope_type: str,
    scope_id: str | None,
) -> AiInsightSnapshot | None:
    stmt = (
        select(AiInsightSnapshot)
        .where(
            and_(
                AiInsightSnapshot.scope_type == scope_type,
                AiInsightSnapshot.scope_id == scope_id,
                AiInsightSnapshot.status == "ready",
            )
        )
        .order_by(desc(AiInsightSnapshot.generated_at))
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


def snapshot_is_fresh(snapshot: AiInsightSnapshot) -> bool:
    return snapshot.expires_at >= datetime.datetime.now(datetime.timezone.utc)


async def get_active_job(
    db: AsyncSession,
    scope_type: str,
    scope_id: str | None,
    context_hash: str,
    prompt_version: str,
) -> AiInsightJob | None:
    stmt = (
        select(AiInsightJob)
        .where(
            and_(
                AiInsightJob.scope_type == scope_type,
                AiInsightJob.scope_id == scope_id,
                AiInsightJob.context_hash == context_hash,
                AiInsightJob.prompt_version == prompt_version,
                AiInsightJob.status.in_(["queued", "running"]),
            )
        )
        .order_by(desc(AiInsightJob.created_at))
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def enqueue_job_if_missing(
    db: AsyncSession,
    *,
    scope_type: str,
    scope_id: str | None,
    context_hash: str,
    model_name: str,
    prompt_version: str,
    context_json: dict[str, Any],
    priority: int = 100,
    requested_by: uuid.UUID | None = None,
) -> AiInsightJob:
    existing = await get_active_job(db, scope_type, scope_id, context_hash, prompt_version)
    if existing:
        return existing

    job = AiInsightJob(
        scope_type=scope_type,
        scope_id=scope_id,
        context_hash=context_hash,
        model_name=model_name,
        prompt_version=prompt_version,
        context_json=context_json,
        status="queued",
        priority=priority,
        requested_by=requested_by,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def claim_next_job(db: AsyncSession) -> AiInsightJob | None:
    # Use SKIP LOCKED to safely claim one queued job across concurrent workers.
    row = await db.execute(
        text(
            """
            WITH next_job AS (
              SELECT job_id
              FROM ai_insight_jobs
              WHERE status = 'queued'
              ORDER BY priority ASC, created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE ai_insight_jobs j
            SET status = 'running',
                started_at = now(),
                attempts = j.attempts + 1
            FROM next_job
            WHERE j.job_id = next_job.job_id
            RETURNING j.job_id;
            """
        )
    )
    claimed = row.first()
    if not claimed:
        await db.rollback()
        return None

    job_id = claimed[0]
    res = await db.execute(select(AiInsightJob).where(AiInsightJob.job_id == job_id))
    await db.commit()
    return res.scalar_one_or_none()


async def mark_job_done(db: AsyncSession, job_id: uuid.UUID) -> None:
    await db.execute(
        update(AiInsightJob)
        .where(AiInsightJob.job_id == job_id)
        .values(status="done", finished_at=datetime.datetime.now(datetime.timezone.utc), error_message=None)
    )
    await db.commit()


async def mark_job_failed(db: AsyncSession, job_id: uuid.UUID, error_message: str) -> None:
    await db.execute(
        update(AiInsightJob)
        .where(AiInsightJob.job_id == job_id)
        .values(status="failed", finished_at=datetime.datetime.now(datetime.timezone.utc), error_message=error_message[:2000])
    )
    await db.commit()


async def upsert_snapshot(
    db: AsyncSession,
    *,
    scope_type: str,
    scope_id: str | None,
    context_hash: str,
    model_name: str,
    prompt_version: str,
    payload_json: dict[str, Any],
    ttl_seconds: int,
    status: str = "ready",
    error_message: str | None = None,
) -> AiInsightSnapshot:
    now = datetime.datetime.now(datetime.timezone.utc)
    expires = now + datetime.timedelta(seconds=max(30, ttl_seconds))

    existing = await get_latest_snapshot(db, scope_type, scope_id, context_hash, prompt_version)
    if existing:
        existing.model_name = model_name
        existing.payload_json = payload_json
        existing.status = status
        existing.error_message = error_message
        existing.generated_at = now
        existing.expires_at = expires
        await db.commit()
        await db.refresh(existing)
        return existing

    snapshot = AiInsightSnapshot(
        scope_type=scope_type,
        scope_id=scope_id,
        context_hash=context_hash,
        model_name=model_name,
        prompt_version=prompt_version,
        payload_json=payload_json,
        status=status,
        error_message=error_message,
        generated_at=now,
        expires_at=expires,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def get_job(db: AsyncSession, job_id: uuid.UUID) -> AiInsightJob | None:
    res = await db.execute(select(AiInsightJob).where(AiInsightJob.job_id == job_id))
    return res.scalar_one_or_none()
