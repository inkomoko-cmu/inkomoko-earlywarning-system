from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx

from app.core.config import settings


def compute_context_hash(scope_type: str, scope_id: str | None, context: dict[str, Any]) -> str:
    canonical = json.dumps(
        {
            "scope_type": scope_type,
            "scope_id": scope_id,
            "context": context,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _clamp_confidence(value: Any) -> int:
    try:
        v = int(round(float(value)))
    except Exception:
        v = 60
    return max(0, min(100, v))


def _normalize_tone(value: Any) -> str:
    tone = str(value or "neutral").lower()
    if tone in {"success", "warning", "danger", "neutral"}:
        return tone
    return "neutral"


def _fallback_insights(scope_type: str, context: dict[str, Any]) -> dict[str, Any]:
    kpis = context.get("kpis", {}) if isinstance(context, dict) else {}
    total = kpis.get("total_enterprises", 0)
    high = kpis.get("high_risk_count", 0)
    revenue = kpis.get("total_projected_revenue", 0)
    share = (high / total * 100) if total else 0
    return {
        "insights": [
            {
                "id": f"{scope_type}-fallback-risk",
                "title": "Risk signal",
                "narrative": f"{share:.1f}% of enterprises are currently high-risk.",
                "confidence": 55,
                "tone": "warning" if share >= 30 else "neutral",
                "actions": ["Use portfolio interventions to stabilize high-risk entities."],
                "evidence": [f"High risk: {high}", f"Total: {total}"],
            },
            {
                "id": f"{scope_type}-fallback-revenue",
                "title": "Revenue outlook",
                "narrative": f"Projected 3-month revenue is {revenue:,.0f}.",
                "confidence": 55,
                "tone": "neutral",
                "actions": ["Cross-check revenue projections against current trend signals."],
                "evidence": ["Fallback summary generated due to model/service constraints."],
            },
        ]
    }


def _normalize_response_payload(payload: dict[str, Any], scope_type: str) -> dict[str, Any]:
    raw = payload.get("insights")
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return _fallback_insights(scope_type, {})

    normalized: list[dict[str, Any]] = []
    for i, item in enumerate(raw[:3]):
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": str(item.get("id") or f"{scope_type}-{i+1}"),
                "title": str(item.get("title") or "Insight"),
                "narrative": str(item.get("narrative") or ""),
                "confidence": _clamp_confidence(item.get("confidence", 60)),
                "tone": _normalize_tone(item.get("tone", "neutral")),
                "actions": [str(a) for a in (item.get("actions") or [])][:3],
                "evidence": [str(a) for a in (item.get("evidence") or [])][:4],
            }
        )

    if not normalized:
        return _fallback_insights(scope_type, {})

    return {"insights": normalized}


def build_prompt(scope_type: str, scope_id: str | None, context: dict[str, Any]) -> str:
    return (
        "You are an analyst for microfinance portfolio intelligence. "
        "Return ONLY valid JSON with this exact schema: "
        '{"insights":[{"id":"string","title":"string","narrative":"string","confidence":0,'
        '"tone":"success|warning|danger|neutral","actions":["string"],"evidence":["string"]}]}. '
        "Constraints: max 3 insights, business language, no markdown, no extra keys. "
        f"Scope type: {scope_type}. Scope id: {scope_id or 'none'}. "
        f"Context JSON: {json.dumps(context, default=str)}"
    )


async def generate_ai_insights(scope_type: str, scope_id: str | None, context: dict[str, Any]) -> dict[str, Any]:
    if not settings.LLM_ENABLED:
        return _fallback_insights(scope_type, context)

    prompt = build_prompt(scope_type, scope_id, context)
    req = {
        "model": settings.LLM_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 1024,
            "num_predict": 220,
        },
    }

    timeout = httpx.Timeout(settings.LLM_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(f"{settings.LLM_BASE_URL}/api/generate", json=req)
        res.raise_for_status()
        body = res.json()

    response_text = body.get("response") if isinstance(body, dict) else None
    if not response_text:
        return _fallback_insights(scope_type, context)

    try:
        parsed = json.loads(response_text)
    except Exception:
        return _fallback_insights(scope_type, context)

    if not isinstance(parsed, dict):
        return _fallback_insights(scope_type, context)

    return _normalize_response_payload(parsed, scope_type)
