import datetime
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def _apply_filters(
    stmt,
    *,
    source: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
):
    if source:
        stmt = stmt.where(AuditLog.meta["source"].astext == source)
    if category:
        stmt = stmt.where(AuditLog.category == category)
    if severity:
        stmt = stmt.where(AuditLog.severity == severity)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                AuditLog.action.ilike(like),
                AuditLog.details.ilike(like),
                AuditLog.actor.ilike(like),
            )
        )
    return stmt


async def create_audit_log(
    db: AsyncSession,
    *,
    action: str,
    category: str = "system",
    severity: str = "info",
    actor: Optional[str] = None,
    details: Optional[str] = None,
    user_id=None,
    resource_type: Optional[str] = None,
    resource_id=None,
    request_context: Optional[dict] = None,
    success: bool = True,
    error_message: Optional[str] = None,
    meta: Optional[dict] = None,
    created_at: Optional[datetime.datetime] = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        category=category,
        severity=severity,
        actor=actor,
        details=details,
        user_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        request_context=request_context or {},
        success=success,
        error_message=error_message,
        meta=meta or {},
    )
    if created_at is not None:
        entry.created_at = created_at

    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def get_audit_logs(
    db: AsyncSession,
    *,
    source: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    stmt = _apply_filters(
        stmt,
        source=source,
        category=category,
        severity=severity,
        search=search,
    )
    total_stmt = select(func.count()).select_from(AuditLog)
    total_stmt = _apply_filters(
        total_stmt,
        source=source,
        category=category,
        severity=severity,
        search=search,
    )

    total_res = await db.execute(total_stmt)
    total = int(total_res.scalar() or 0)

    res = await db.execute(stmt.offset(offset).limit(limit))
    rows = res.scalars().all()

    return rows, total


async def get_counts(db: AsyncSession) -> dict:
    cat_stmt = select(AuditLog.category, func.count()).group_by(AuditLog.category)
    sev_stmt = select(AuditLog.severity, func.count()).group_by(AuditLog.severity)
    src_stmt = select(
        func.coalesce(AuditLog.meta["source"].astext, "backend"),
        func.count(),
    ).group_by(func.coalesce(AuditLog.meta["source"].astext, "backend"))

    cat_rows = (await db.execute(cat_stmt)).all()
    sev_rows = (await db.execute(sev_stmt)).all()
    src_rows = (await db.execute(src_stmt)).all()

    return {
        "category_counts": {r[0]: r[1] for r in cat_rows},
        "severity_counts": {r[0]: r[1] for r in sev_rows},
        "source_counts": {r[0]: r[1] for r in src_rows},
    }


async def get_by_fingerprint(db: AsyncSession, fingerprint: str) -> Optional[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.meta["fingerprint"].astext == fingerprint)
    res = await db.execute(stmt)
    return res.scalar_one_or_none()
