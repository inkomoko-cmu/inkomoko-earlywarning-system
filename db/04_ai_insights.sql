\set ON_ERROR_STOP on

-- AI insight snapshots: latest generated summaries keyed by scope and context hash
CREATE TABLE IF NOT EXISTS ai_insight_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_id TEXT NULL,
  context_hash TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready', -- ready | failed
  error_message TEXT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id, context_hash, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_ai_snapshot_scope_hash
  ON ai_insight_snapshots(scope_type, scope_id, context_hash, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_snapshot_expires
  ON ai_insight_snapshots(expires_at DESC);

-- AI insight generation jobs: async queue consumed by background worker
CREATE TABLE IF NOT EXISTS ai_insight_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_id TEXT NULL,
  context_hash TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
  priority SMALLINT NOT NULL DEFAULT 100,
  attempts INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  requested_by UUID NULL REFERENCES auth_user(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue
  ON ai_insight_jobs(status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_scope_hash
  ON ai_insight_jobs(scope_type, scope_id, context_hash);

-- Deduplicate active jobs for same scope/context
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_jobs_active
  ON ai_insight_jobs(scope_type, COALESCE(scope_id, ''), context_hash, prompt_version)
  WHERE status IN ('queued', 'running');
