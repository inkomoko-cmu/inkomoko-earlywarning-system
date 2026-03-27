from __future__ import annotations

import asyncio
from types import SimpleNamespace

from sqlalchemy.exc import IntegrityError

from app.crud import ai_insights as ai_crud


class FakeSession:
    def __init__(self, should_raise_once: bool):
        self.should_raise_once = should_raise_once
        self.added = []
        self.rollback_called = False
        self.commit_calls = 0

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_calls += 1
        if self.should_raise_once:
            self.should_raise_once = False
            raise IntegrityError(
                statement="INSERT INTO ai_insight_jobs ...",
                params=None,
                orig=Exception('duplicate key value violates unique constraint "uq_ai_jobs_active"'),
            )

    async def rollback(self):
        self.rollback_called = True

    async def refresh(self, _):
        return None


def test_enqueue_job_if_missing_returns_existing_when_unique_race(monkeypatch):
    existing = SimpleNamespace(job_id="existing-job", status="queued")
    calls = {"count": 0}

    async def fake_get_active_job(db, scope_type, scope_id, context_hash, prompt_version):
        _ = (db, scope_type, scope_id, context_hash, prompt_version)
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return existing

    monkeypatch.setattr(ai_crud, "get_active_job", fake_get_active_job)

    db = FakeSession(should_raise_once=True)
    result = asyncio.run(
        ai_crud.enqueue_job_if_missing(
            db,
            scope_type="scenarios",
            scope_id="scenarios-page",
            context_hash="abc123",
            model_name="qwen2.5:7b-instruct",
            prompt_version="v1",
            context_json={"k": "v"},
        )
    )

    assert result is existing
    assert db.rollback_called is True
    assert db.commit_calls == 1
