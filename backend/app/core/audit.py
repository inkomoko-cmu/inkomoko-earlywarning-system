"""In-memory audit log for backend and ML pipeline events.

Seeded with realistic demo events covering auth, data, prediction,
model, advisory, and system categories across backend and ML sources.
"""
from __future__ import annotations

import datetime
import threading
from typing import Optional

_audit_log: list[dict] = []
_AUDIT_MAX = 2000
_lock = threading.Lock()
_id_counter = [0]


def log_event(
    action: str,
    category: str = "system",
    severity: str = "info",
    actor: str = "system",
    details: str = "",
    source: str = "backend",
    meta: Optional[dict] = None,
) -> None:
    """Append an event to the in-memory audit trail."""
    with _lock:
        _id_counter[0] += 1
        entry = {
            "id": _id_counter[0],
            "timestamp": datetime.datetime.now(tz=datetime.timezone.utc).isoformat(),
            "action": action,
            "category": category,
            "severity": severity,
            "actor": actor,
            "details": details,
            "source": source,
            "meta": meta or {},
        }
        _audit_log.append(entry)
        if len(_audit_log) > _AUDIT_MAX:
            _audit_log[:] = _audit_log[-_AUDIT_MAX:]


def get_log(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    source: Optional[str] = None,
) -> list[dict]:
    """Return events newest-first, with optional filters."""
    with _lock:
        events = list(reversed(_audit_log))
    if category:
        events = [e for e in events if e.get("category") == category]
    if severity:
        events = [e for e in events if e.get("severity") == severity]
    if source:
        events = [e for e in events if e.get("source") == source]
    return events


def get_summary() -> dict:
    """Return aggregate counts for KPI display."""
    with _lock:
        events = list(_audit_log)
    cat_counts: dict[str, int] = {}
    sev_counts: dict[str, int] = {}
    src_counts: dict[str, int] = {}
    for e in events:
        cat_counts[e["category"]] = cat_counts.get(e["category"], 0) + 1
        sev_counts[e["severity"]] = sev_counts.get(e["severity"], 0) + 1
        src_counts[e["source"]] = src_counts.get(e["source"], 0) + 1
    return {
        "total": len(events),
        "category_counts": cat_counts,
        "severity_counts": sev_counts,
        "source_counts": src_counts,
    }


def clear_log() -> int:
    """Clear all log entries. Returns count cleared."""
    with _lock:
        count = len(_audit_log)
        _audit_log.clear()
        _id_counter[0] = 0
    return count


def _seed_demo_events() -> None:
    """Seed the log with realistic demo events across all sources."""
    base = datetime.datetime.now(tz=datetime.timezone.utc)

    demo: list[dict] = [
        # ── System startup ──────────────────────────────────────────────
        {
            "action": "Application started",
            "category": "system", "severity": "info", "source": "backend",
            "actor": "system",
            "details": "FastAPI backend initialized successfully. All routers registered.",
            "meta": {"version": "1.0.0"}, "offset_min": 480,
        },
        {
            "action": "ML models loaded",
            "category": "model", "severity": "info", "source": "ml",
            "actor": "system",
            "details": "15 model artifacts loaded: risk (6), employment (6), revenue (3).",
            "meta": {"model_count": 15, "pipelines": ["risk", "employment", "revenue"]}, "offset_min": 479,
        },
        {
            "action": "CORS policy applied",
            "category": "system", "severity": "info", "source": "backend",
            "actor": "system",
            "details": "Allowed origins configured for localhost:3000.",
            "meta": {}, "offset_min": 478,
        },
        # ── Auth events ─────────────────────────────────────────────────
        {
            "action": "Debug admin authenticated",
            "category": "auth", "severity": "warning", "source": "backend",
            "actor": "admin@admin.com",
            "details": "Debug-mode bypass login granted. ENABLE_DEBUG_AUTH is active — disable before production deployment.",
            "meta": {"sub": "debug-admin", "roles": ["admin"]}, "offset_min": 475,
        },
        {
            "action": "Admin dashboard accessed",
            "category": "auth", "severity": "info", "source": "backend",
            "actor": "admin@admin.com",
            "details": "Admin accessed audit log and system health dashboard.",
            "meta": {}, "offset_min": 472,
        },
        {
            "action": "RBAC policy accessed",
            "category": "auth", "severity": "info", "source": "backend",
            "actor": "admin@admin.com",
            "details": "Admin reviewed role-based access control configuration and masking rules.",
            "meta": {"endpoint": "/rbac/roles"}, "offset_min": 470,
        },
        {
            "action": "Access denied — restricted export",
            "category": "auth", "severity": "warning", "source": "backend",
            "actor": "M. M.",
            "details": "Advisor attempted to export enterprise-level PII identifiers. Policy violation blocked by RBAC guard.",
            "meta": {"role": "advisor", "resource": "enterprise_identifiers"}, "offset_min": 460,
        },
        {
            "action": "Donor lens accessed",
            "category": "auth", "severity": "info", "source": "backend",
            "actor": "D. R.",
            "details": "Donor role accessed resilience scorecard. PII masked per data governance policy.",
            "meta": {"role": "donor", "resource": "resilience_scorecard"}, "offset_min": 455,
        },
        # ── Data events ─────────────────────────────────────────────────
        {
            "action": "Sample data loaded",
            "category": "data", "severity": "info", "source": "ml",
            "actor": "user",
            "details": "Loaded 5 random records from built-in test dataset for demo inference.",
            "meta": {"record_count": 5, "source": "test.csv"}, "offset_min": 440,
        },
        {
            "action": "Batch data uploaded",
            "category": "data", "severity": "info", "source": "ml",
            "actor": "A. N.",
            "details": "Uploaded portfolio_q1_2026.xlsx — 248 enterprise records parsed and stored in memory.",
            "meta": {"filename": "portfolio_q1_2026.xlsx", "row_count": 248}, "offset_min": 420,
        },
        {
            "action": "Data quality audit executed",
            "category": "data", "severity": "info", "source": "ml",
            "actor": "S. W.",
            "details": "Quality score 94.3% — 12 contract violations across 38 columns. Fill rate below threshold on 2 fields.",
            "meta": {"quality_score": 94.3, "violations": 12, "columns": 38}, "offset_min": 415,
        },
        {
            "action": "Schema contract violation detected",
            "category": "data", "severity": "warning", "source": "ml",
            "actor": "system",
            "details": "Column 'monthly_customer': 3.2% fill rate below 90% completeness threshold.",
            "meta": {"column": "monthly_customer", "fill_rate": 3.2, "threshold": 90}, "offset_min": 414,
        },
        {
            "action": "Outlier range violation detected",
            "category": "data", "severity": "warning", "source": "ml",
            "actor": "system",
            "details": "Column 'revenue': 7 values exceed 3σ statistical outlier boundary.",
            "meta": {"column": "revenue", "outlier_count": 7}, "offset_min": 413,
        },
        {
            "action": "Stored data cleared",
            "category": "data", "severity": "warning", "source": "ml",
            "actor": "S. W.",
            "details": "Cleared 248 records from in-memory data store after completed analysis cycle.",
            "meta": {"cleared_rows": 248, "previous_filename": "portfolio_q1_2026.xlsx"}, "offset_min": 390,
        },
        # ── Prediction events ────────────────────────────────────────────
        {
            "action": "Batch prediction completed",
            "category": "prediction", "severity": "info", "source": "ml",
            "actor": "user",
            "details": "All 3 pipelines (risk, employment, revenue) executed on 248 records.",
            "meta": {"record_count": 248, "pipelines": ["risk", "employment", "revenue"]}, "offset_min": 380,
        },
        {
            "action": "Portfolio scored",
            "category": "prediction", "severity": "info", "source": "ml",
            "actor": "user",
            "details": "Scored 248 enterprises: 31 HIGH risk, 89 MEDIUM risk, 128 LOW risk.",
            "meta": {"enterprise_count": 248, "high": 31, "medium": 89, "low": 128}, "offset_min": 375,
        },
        {
            "action": "High-risk alert flagged",
            "category": "prediction", "severity": "warning", "source": "ml",
            "actor": "system",
            "details": "Enterprise EWS-20240043 risk score 0.87 (HIGH). Escalation to advisor recommended.",
            "meta": {"unique_id": "EWS-20240043", "risk_score": 0.87, "tier": "HIGH"}, "offset_min": 370,
        },
        {
            "action": "Client profile scored",
            "category": "prediction", "severity": "info", "source": "ml",
            "actor": "V. U.",
            "details": "Single-client deep prediction executed for enterprise EWS-20240187 across all pipelines.",
            "meta": {"unique_id": "EWS-20240187", "pipelines": ["risk", "employment", "revenue"]}, "offset_min": 360,
        },
        {
            "action": "Revenue forecast generated",
            "category": "prediction", "severity": "info", "source": "ml",
            "actor": "V. U.",
            "details": "3-month revenue forecast: $4,820 (1m), $5,340 (2m), $5,910 (3m) for EWS-20240187.",
            "meta": {"unique_id": "EWS-20240187", "rev_1m": 4820, "rev_2m": 5340, "rev_3m": 5910}, "offset_min": 358,
        },
        {
            "action": "Employment forecast generated",
            "category": "prediction", "severity": "info", "source": "ml",
            "actor": "V. U.",
            "details": "Net employment change: +2 positions projected over 3 months for EWS-20240187.",
            "meta": {"unique_id": "EWS-20240187", "net_jobs_3m": 2}, "offset_min": 357,
        },
        # ── Advisory events ──────────────────────────────────────────────
        {
            "action": "Advisory plans generated",
            "category": "advisory", "severity": "info", "source": "ml",
            "actor": "V. U.",
            "details": "Generated 248 advisory plans with 1,872 total action items. 31 CRITICAL priority.",
            "meta": {"plan_count": 248, "total_actions": 1872, "critical": 31}, "offset_min": 320,
        },
        {
            "action": "Advisory plan viewed",
            "category": "advisory", "severity": "info", "source": "backend",
            "actor": "V. U.",
            "details": "Advisor reviewed governance-aware advisory plan for Rwanda cohort enterprise EWS-20240103.",
            "meta": {"unique_id": "EWS-20240103", "country": "Rwanda", "tier": "HIGH"}, "offset_min": 310,
        },
        {
            "action": "Donor pack report generated",
            "category": "advisory", "severity": "info", "source": "backend",
            "actor": "D. R.",
            "details": "Donor transparency pack compiled for Q1 2026 portfolio review — 248 enterprises, 3 countries.",
            "meta": {"report_type": "donor_pack", "enterprise_count": 248}, "offset_min": 300,
        },
        {
            "action": "Program brief exported",
            "category": "advisory", "severity": "info", "source": "backend",
            "actor": "A. N.",
            "details": "Program operational brief exported for Rwanda cohort — March 2026. PDF generated.",
            "meta": {"report_type": "program_brief", "country": "Rwanda"}, "offset_min": 290,
        },
        # ── Model events ─────────────────────────────────────────────────
        {
            "action": "Model cards viewed",
            "category": "model", "severity": "info", "source": "ml",
            "actor": "S. W.",
            "details": "Admin accessed model performance metrics and feature importance for all 15 models.",
            "meta": {"model_count": 15}, "offset_min": 270,
        },
        {
            "action": "Model retrain requested",
            "category": "model", "severity": "warning", "source": "ml",
            "actor": "S. W.",
            "details": "Risk pipeline retrain initiated with updated Q4-2025 training data (1,240 rows).",
            "meta": {"pipeline": "risk", "filename": "q4_2025_training.csv", "rows": 1240}, "offset_min": 120,
        },
        {
            "action": "Risk pipeline retrained",
            "category": "model", "severity": "warning", "source": "ml",
            "actor": "system",
            "details": "Risk tier models retrained successfully — AUC macro: 0.891, F1 weighted: 0.847. 6 model files updated.",
            "meta": {"pipeline": "risk", "auc": 0.891, "f1_weighted": 0.847, "models_saved": 6}, "offset_min": 108,
        },
        {
            "action": "Models reloaded into registry",
            "category": "model", "severity": "info", "source": "ml",
            "actor": "system",
            "details": "All 15 model artifacts hot-reloaded into memory registry after risk pipeline retrain.",
            "meta": {"model_count": 15, "pipeline": "risk"}, "offset_min": 107,
        },
        # ── Export / reporting ───────────────────────────────────────────
        {
            "action": "KPI report exported (PDF)",
            "category": "system", "severity": "info", "source": "backend",
            "actor": "D. R.",
            "details": "Impact overview KPI report exported by donor role. Masking policy applied.",
            "meta": {"role": "donor", "format": "pdf"}, "offset_min": 60,
        },
        {
            "action": "Audit log exported (PDF)",
            "category": "system", "severity": "info", "source": "backend",
            "actor": "A. N.",
            "details": "Full audit trail PDF exported for compliance archive — 28 events recorded.",
            "meta": {"format": "pdf", "event_count": 28}, "offset_min": 45,
        },
        # ── Recent / current ─────────────────────────────────────────────
        {
            "action": "Health check passed",
            "category": "system", "severity": "info", "source": "backend",
            "actor": "system",
            "details": "System health endpoint polled. All services operational (debug mode active).",
            "meta": {"debug_mode": True}, "offset_min": 5,
        },
        {
            "action": "ML service status checked",
            "category": "system", "severity": "info", "source": "ml",
            "actor": "system",
            "details": "15/15 model artifacts present. Inference pipelines ready.",
            "meta": {"model_count": 15, "expected": 15}, "offset_min": 4,
        },
    ]

    for ev in demo:
        with _lock:
            _id_counter[0] += 1
            entry = {
                "id": _id_counter[0],
                "timestamp": (base - datetime.timedelta(minutes=ev["offset_min"])).isoformat(),
                "action": ev["action"],
                "category": ev["category"],
                "severity": ev["severity"],
                "actor": ev["actor"],
                "details": ev["details"],
                "source": ev["source"],
                "meta": ev.get("meta", {}),
            }
            _audit_log.append(entry)

    # Sort ascending so newest-first reversal works correctly
    _audit_log.sort(key=lambda x: x["timestamp"])


# Seed on import so the log is populated from first request
_seed_demo_events()
