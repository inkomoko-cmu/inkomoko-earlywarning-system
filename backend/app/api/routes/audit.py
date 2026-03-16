"""Audit log endpoint backed by Postgres audit_log table."""

import datetime
import httpx
import logging
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import delete, select

from app.core import audit as fallback_audit
from app.crud.audit import get_audit_logs, get_counts
from app.db.session import _build_engine
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit", tags=["Audit"])

# ML service base URL (standalone FastAPI at port 8080)
ML_SERVICE_URL = "http://127.0.0.1:8080"

_GOVERNANCE_EVENTS = [
    {
        "time": "2026-02-07 09:12",
        "actor": "A. N.",
        "role": "Program Manager",
        "action": "Export KPI Report (PDF)",
        "resource": "Impact Overview",
        "outcome": "Success",
    },
    {
        "time": "2026-02-07 09:06",
        "actor": "S. W.",
        "role": "Admin",
        "action": "Update Access Policy",
        "resource": "RBAC Masking Rules",
        "outcome": "Success",
    },
    {
        "time": "2026-02-07 08:55",
        "actor": "V. U.",
        "role": "Advisor",
        "action": "Generate Advisory Plan",
        "resource": "Enterprise 8f2...",
        "outcome": "Success",
    },
    {
        "time": "2026-02-07 08:41",
        "actor": "D. R.",
        "role": "Donor",
        "action": "View Donor Lens",
        "resource": "Resilience Scorecard",
        "outcome": "Success",
    },
    {
        "time": "2026-02-07 08:22",
        "actor": "M. M.",
        "role": "Admin",
        "action": "Attempt Restricted Export",
        "resource": "Enterprise-level Identifiers",
        "outcome": "Denied",
    },
]


def _governance_category(action: str) -> str:
    action_l = action.lower()
    if "export" in action_l:
        return "advisory"
    if "access" in action_l:
        return "system"
    if "advisory" in action_l:
        return "advisory"
    return "data"


def _governance_severity(outcome: str) -> str:
    return "warning" if outcome.lower() == "denied" else "info"


def _parse_gov_time(ts: str) -> datetime.datetime:
    dt = datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M")
    return dt.replace(tzinfo=datetime.timezone.utc)


def _event_fingerprint(source: str, event: dict) -> str:
    return f"{source}:{event.get('id', '')}:{event.get('timestamp', '')}:{event.get('action', '')}"


async def _fetch_ml_events(limit: int = 500) -> list[dict]:
    """Try to fetch audit events from the ML demo service. Returns [] on failure."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{ML_SERVICE_URL}/demo/audit-log", params={"limit": limit})
            if r.status_code == 200:
                data = r.json()
                events = data.get("events", [])
                for e in events:
                    e["source"] = "ml"
                    if "meta" not in e:
                        e["meta"] = {}
                return events
    except Exception as exc:
        logger.debug("ML service audit unavailable: %s", exc)
    return []


async def _ensure_governance_seed(db) -> None:
    exists_stmt = select(AuditLog.audit_id).where(
        AuditLog.meta["source"].astext == "governance"
    ).limit(1)
    exists = (await db.execute(exists_stmt)).scalar_one_or_none()
    if exists:
        return

    entries = []
    for item in _GOVERNANCE_EVENTS:
        created_at = _parse_gov_time(item["time"])
        category = _governance_category(item["action"])
        severity = _governance_severity(item["outcome"])
        actor = f"{item['actor']} ({item['role']})"
        details = f"Resource: {item['resource']} - Outcome: {item['outcome']}"
        fingerprint = _event_fingerprint("governance", {
            "timestamp": created_at.isoformat(),
            "action": item["action"],
        })
        meta = {
            "role": item["role"],
            "resource": item["resource"],
            "outcome": item["outcome"],
            "source": "governance",
            "fingerprint": fingerprint,
        }
        entries.append(
            AuditLog(
                action=item["action"],
                category=category,
                severity=severity,
                actor=actor,
                details=details,
                request_context={},
                success=item["outcome"].lower() != "denied",
                meta=meta,
                created_at=created_at,
            )
        )

    if entries:
        db.add_all(entries)
        await db.commit()


async def _ingest_external_events(db, events: list[dict], source: str) -> None:
    if not events:
        return

    fingerprints = []
    for event in events:
        fingerprints.append(_event_fingerprint(source, event))

    existing_stmt = select(AuditLog.meta["fingerprint"].astext).where(
        AuditLog.meta["fingerprint"].astext.in_(fingerprints)
    )
    existing_rows = (await db.execute(existing_stmt)).scalars().all()
    existing = set(existing_rows)

    new_entries = []
    for event in events:
        fingerprint = _event_fingerprint(source, event)
        if fingerprint in existing:
            continue

        meta = event.get("meta") or {}
        meta = {
            **meta,
            "source": source,
            "fingerprint": fingerprint,
        }
        created_at = None
        timestamp = event.get("timestamp")
        if timestamp:
            try:
                created_at = datetime.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                created_at = None

        new_entries.append(
            AuditLog(
                action=event.get("action", ""),
                category=event.get("category", "system"),
                severity=event.get("severity", "info"),
                actor=event.get("actor") or "system",
                details=event.get("details") or "",
                request_context=event.get("request_context") or {},
                success=event.get("success", True),
                error_message=event.get("error_message"),
                meta=meta,
                created_at=created_at,
            )
        )

    if new_entries:
        db.add_all(new_entries)
        await db.commit()


def _row_to_event(row: AuditLog) -> dict:
    meta = row.meta or {}
    source = meta.get("source") or (row.request_context or {}).get("source") or "backend"
    return {
        "id": str(row.audit_id),
        "timestamp": row.created_at.isoformat(),
        "source": source,
        "action": row.action,
        "category": row.category,
        "severity": row.severity,
        "actor": row.actor or "system",
        "details": row.details or "",
        "meta": meta,
    }


@router.get("/logs", summary="Aggregated audit log (Postgres-backed)")
async def get_audit_logs_endpoint(
    source: Optional[str] = Query(default=None, description="backend | ml | governance"),
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    try:
        async with _build_engine()() as db:
            await _ensure_governance_seed(db)

            ml_events = []
            ml_available = False
            if source in (None, "ml"):
                ml_events = await _fetch_ml_events()
                ml_available = len(ml_events) > 0
                await _ingest_external_events(db, ml_events, "ml")

            rows, total = await get_audit_logs(
                db,
                source=source,
                category=category,
                severity=severity,
                search=search,
                limit=limit,
                offset=offset,
            )
            counts = await get_counts(db)

            events = [_row_to_event(r) for r in rows]
            return {
                "total": total,
                "offset": offset,
                "limit": limit,
                "page_count": len(events),
                **counts,
                "ml_available": ml_available,
                "events": events,
            }
    except Exception as exc:
        logger.warning("Audit log DB unavailable, using fallback: %s", exc)

    fallback_events = fallback_audit.get_log(
        category=category,
        severity=severity,
        source=source,
    )
    if search:
        q = search.lower()
        fallback_events = [
            e for e in fallback_events
            if q in (e.get("action", "") + " " + e.get("details", "") + " " + e.get("actor", "")).lower()
        ]

    total = len(fallback_events)
    page = fallback_events[offset: offset + limit]
    summary = fallback_audit.get_summary()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "page_count": len(page),
        "category_counts": summary.get("category_counts", {}),
        "severity_counts": summary.get("severity_counts", {}),
        "source_counts": summary.get("source_counts", {}),
        "ml_available": False,
        "events": page,
    }


@router.delete("/logs", summary="Clear audit log")
async def clear_audit_log():
    try:
        async with _build_engine()() as db:
            res = await db.execute(select(AuditLog.audit_id))
            count = len(res.scalars().all())
            await db.execute(delete(AuditLog))
            await db.commit()
            return {"status": "cleared", "cleared_count": count}
    except Exception as exc:
        logger.warning("Audit log DB unavailable, clearing fallback: %s", exc)

    count = fallback_audit.clear_log()
    fallback_audit.log_event(
        action="Audit log cleared",
        category="system",
        severity="warning",
        details=f"Cleared {count} fallback entries.",
        source="backend",
    )
    return {"status": "cleared", "cleared_count": count}
