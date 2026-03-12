"""Audit log aggregation endpoint — combines backend events + ML service events."""

import datetime
import httpx
import logging
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit", tags=["Audit"])

# ML service base URL (standalone FastAPI at port 8080)
ML_SERVICE_URL = "http://127.0.0.1:8080"

# ── In-memory backend audit log ──────────────────────────────────────────────
_backend_log: list[dict] = []
_AUDIT_MAX = 2000
_audit_counter = 0


def log_event(
    action: str,
    category: str = "system",
    severity: str = "info",
    actor: str = "system",
    details: str = "",
    meta: Optional[dict] = None,
):
    """Append a backend event to the in-memory audit trail."""
    global _audit_counter
    _audit_counter += 1
    entry = {
        "id": _audit_counter,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "source": "backend",
        "action": action,
        "category": category,
        "severity": severity,
        "actor": actor,
        "details": details,
        "meta": meta or {},
    }
    _backend_log.append(entry)
    if len(_backend_log) > _AUDIT_MAX:
        _backend_log[:] = _backend_log[-_AUDIT_MAX:]
    return entry


# ── Seed realistic backend events ────────────────────────────────────────────
def _seed_events():
    base = datetime.datetime(2026, 3, 12, 8, 0, 0)

    _seed = [
        (0,   "auth",       "system",     "info",     "API server started",                  "FastAPI/uvicorn started on port 8000",         "system"),
        (12,  "auth",       "auth",       "info",     "User login",                          "Debug admin authenticated via bypass",         "admin@admin.com"),
        (25,  "data",       "data",       "info",     "Data upload received",                "CSV upload: 342 enterprise records ingested",  "admin@admin.com"),
        (38,  "data",       "data",       "warning",  "Schema validation warning",           "12 rows missing 'revenue_prev_3m' field",      "system"),
        (55,  "model",      "model",      "info",     "Model status checked",                "15/15 models loaded in memory",                "admin@admin.com"),
        (70,  "prediction", "prediction", "info",     "Batch prediction run",                "Risk scores computed for 342 enterprises",     "admin@admin.com"),
        (85,  "prediction", "prediction", "info",     "Employment forecast run",             "Jobs created/lost 3-month forecast complete",  "admin@admin.com"),
        (102, "advisory",   "advisory",   "info",     "Advisory plan generated",             "High-risk enterprise ENT-8F2: plan created",    "advisor@inkomoko.org"),
        (118, "auth",       "auth",       "warning",  "Role escalation attempt",             "User requested admin scope without privilege",  "pm@inkomoko.org"),
        (135, "data",       "data",       "info",     "Data quality audit executed",         "DQ score: 91.4% — 3 contract violations",      "admin@admin.com"),
        (152, "advisory",   "advisory",   "info",     "Donor report exported",               "PDF: Rwanda Q1 2026 Donor Pack generated",     "donor@org.rw"),
        (170, "model",      "model",      "info",     "Model retrain triggered",             "Background training job submitted",            "admin@admin.com"),
        (195, "prediction", "prediction", "warning",  "Low-confidence prediction flagged",   "ENT-3A1: risk_score confidence < 0.55",        "system"),
        (210, "system",     "system",     "error",    "Database connection refused",         "PostgreSQL unreachable — using debug mode",    "system"),
        (230, "auth",       "auth",       "info",     "User session refreshed",              "JWT token renewed for admin@admin.com",        "admin@admin.com"),
    ]

    for offset_s, category, _, severity, action, details, actor in _seed:
        ts = base + datetime.timedelta(seconds=offset_s)
        global _audit_counter
        _audit_counter += 1
        _backend_log.append({
            "id": _audit_counter,
            "timestamp": ts.isoformat() + "Z",
            "source": "backend",
            "action": action,
            "category": category,
            "severity": severity,
            "actor": actor,
            "details": details,
            "meta": {},
        })


_seed_events()


# ── Helpers ──────────────────────────────────────────────────────────────────
def _count_by(events: list[dict], field: str) -> dict:
    counts: dict = {}
    for e in events:
        v = e.get(field, "unknown")
        counts[v] = counts.get(v, 0) + 1
    return counts


async def _fetch_ml_events(limit: int = 500) -> list[dict]:
    """Try to fetch audit events from the ML demo service. Returns [] on failure."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{ML_SERVICE_URL}/demo/audit-log", params={"limit": limit})
            if r.status_code == 200:
                data = r.json()
                events = data.get("events", [])
                # Normalise to our unified schema
                for e in events:
                    e["source"] = "ml"
                    if "meta" not in e:
                        e["meta"] = {}
                return events
    except Exception as exc:
        logger.debug("ML service audit unavailable: %s", exc)
    return []


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/logs", summary="Aggregated audit log (backend + ML service)")
async def get_audit_logs(
    source: Optional[str] = Query(default=None, description="backend | ml | governance"),
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    # Collect backend events
    backend_events = list(reversed(_backend_log))

    # Try ML service
    ml_events = []
    if source in (None, "ml"):
        ml_events = await _fetch_ml_events()

    # Merge
    all_events = backend_events + ml_events

    # Filter
    if source == "backend":
        all_events = [e for e in all_events if e.get("source") == "backend"]
    elif source == "ml":
        all_events = ml_events
    elif source == "governance":
        # Governance events only come from frontend static data; return nothing from here
        all_events = []

    if category:
        all_events = [e for e in all_events if e.get("category") == category]
    if severity:
        all_events = [e for e in all_events if e.get("severity") == severity]
    if search:
        q = search.lower()
        all_events = [
            e for e in all_events
            if q in (e.get("action", "") + " " + e.get("details", "") + " " + e.get("actor", "")).lower()
        ]

    total = len(all_events)
    page = all_events[offset: offset + limit]

    # Summary stats across ALL events (before filtering)
    combined = backend_events + ml_events
    category_counts = _count_by(combined, "category")
    severity_counts = _count_by(combined, "severity")
    source_counts = _count_by(combined, "source")

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "page_count": len(page),
        "category_counts": category_counts,
        "severity_counts": severity_counts,
        "source_counts": source_counts,
        "ml_available": len(ml_events) > 0,
        "events": page,
    }


@router.delete("/logs", summary="Clear backend audit log")
async def clear_backend_audit_log():
    count = len(_backend_log)
    _backend_log.clear()
    log_event(
        action="Backend audit log cleared",
        category="system",
        severity="warning",
        details=f"Cleared {count} previous backend entries.",
    )
    return {"status": "cleared", "cleared_count": count}
