\set ON_ERROR_STOP on

-- -- Database: inkomoko_early_warning

-- -- DROP DATABASE IF EXISTS inkomoko_early_warning;

-- CREATE DATABASE inkomoko_early_warning
--     WITH
--     OWNER = postgres
--     ENCODING = 'UTF8'
--     LC_COLLATE = 'English_Rwanda.1252'
--     LC_CTYPE = 'English_Rwanda.1252'
--     LOCALE_PROVIDER = 'libc'
--     TABLESPACE = pg_default
--     CONNECTION LIMIT = -1
--     IS_TEMPLATE = False;



-- Run once
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional (if you plan to store embeddings in Postgres)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Optional (only if pgvector is installed)
-- CREATE EXTENSION IF NOT EXISTS vector;


CREATE TABLE IF NOT EXISTS ref_country (
  country_code TEXT PRIMARY KEY,          -- e.g. "RW", "KE", "UG"
  country_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_currency (
  currency_code TEXT PRIMARY KEY,         -- e.g. "RWF", "KES", "USD"
  currency_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ref_program (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code TEXT UNIQUE,
  program_name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ref_cohort (
  cohort_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_name TEXT NOT NULL,              -- e.g. "2023 Q2 Rwanda Retail"
  cohort_year INT,
  start_date DATE,
  end_date DATE,
  program_id UUID REFERENCES ref_program(program_id) ON DELETE SET NULL,
  country_code TEXT REFERENCES ref_country(country_code) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_cohort_program ON ref_cohort(program_id);
CREATE INDEX IF NOT EXISTS idx_cohort_country ON ref_cohort(country_code);


CREATE TABLE IF NOT EXISTS dim_client (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_client_key TEXT NOT NULL,       -- stable pseudonymous key from IMS (no PII)
  country_code TEXT REFERENCES ref_country(country_code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_client_key, country_code)
);

CREATE TABLE IF NOT EXISTS dim_enterprise (
  enterprise_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES dim_client(client_id) ON DELETE CASCADE,
  external_enterprise_key TEXT NOT NULL,    -- stable pseudonymous key from IMS
  sector TEXT,
  sub_sector TEXT,
  enterprise_type TEXT,
  baseline_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (external_enterprise_key, client_id)
);

CREATE INDEX IF NOT EXISTS idx_enterprise_client ON dim_enterprise(client_id);


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM (
      'baseline', 'visit', 'endline', 'growth_tracker', 'training', 'investment', 'other'
    );
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS fact_enterprise_event (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id UUID NOT NULL REFERENCES dim_enterprise(enterprise_id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES ref_cohort(cohort_id) ON DELETE SET NULL,
  program_id UUID REFERENCES ref_program(program_id) ON DELETE SET NULL,
  country_code TEXT REFERENCES ref_country(country_code) ON DELETE RESTRICT,

  event_type event_type NOT NULL,
  event_date DATE NOT NULL,
  event_ts TIMESTAMPTZ, -- optional if time-of-day matters
  source_system TEXT NOT NULL DEFAULT 'IMS',

  -- Semi-structured fields from harmonized exports (no PII)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_enterprise_date ON fact_enterprise_event(enterprise_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_type_date ON fact_enterprise_event(event_type, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_country_date ON fact_enterprise_event(country_code, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_event_payload_gin ON fact_enterprise_event USING GIN(payload);

CREATE TABLE IF NOT EXISTS fact_kpi_snapshot (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id UUID NOT NULL REFERENCES dim_enterprise(enterprise_id) ON DELETE CASCADE,
  cohort_id UUID REFERENCES ref_cohort(cohort_id) ON DELETE SET NULL,
  program_id UUID REFERENCES ref_program(program_id) ON DELETE SET NULL,
  country_code TEXT REFERENCES ref_country(country_code) ON DELETE RESTRICT,

  as_of_date DATE NOT NULL,                  -- snapshot date (monthly/quarterly)
  currency_code TEXT REFERENCES ref_currency(currency_code),

  revenue_monthly NUMERIC(18,2),
  profit_monthly NUMERIC(18,2),
  expenses_monthly NUMERIC(18,2),

  jobs_total INT,
  jobs_created_3m INT,
  jobs_lost_3m INT,

  business_active BOOLEAN,                   -- survival proxy
  resilience_index NUMERIC(6,3),             -- optional engineered KPI (0..1 or 0..100)

  data_quality_score NUMERIC(5,2),           -- 0..100
  quality_flags JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_kpi_asof_country ON fact_kpi_snapshot(as_of_date DESC, country_code);
CREATE INDEX IF NOT EXISTS idx_kpi_enterprise ON fact_kpi_snapshot(enterprise_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_quality_gin ON fact_kpi_snapshot USING GIN(quality_flags);


CREATE TABLE IF NOT EXISTS ml_model (
  model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL UNIQUE,            -- e.g. "M1_RISK", "M2_JOBS_CREATED"
  model_name TEXT NOT NULL,
  task_type TEXT NOT NULL,                   -- "classification" / "regression"
  target_description TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ml_model_version (
  model_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES ml_model(model_id) ON DELETE CASCADE,

  version_tag TEXT NOT NULL,                 -- e.g. "v1.0.0"
  training_start TIMESTAMPTZ,
  training_end TIMESTAMPTZ,
  training_dataset_ref TEXT,                 -- pointer to dataset snapshot ID / object store path
  feature_set_ref TEXT,                      -- pointer to feature config (git hash / artifact key)
  algorithm TEXT NOT NULL,                   -- e.g. "LogisticRegression", "XGBoostRegressor"
  hyperparams JSONB NOT NULL DEFAULT '{}'::jsonb,

  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,      -- MAE, F1, AUC etc
  slices JSONB NOT NULL DEFAULT '{}'::jsonb,       -- country/cohort metrics
  calibration JSONB NOT NULL DEFAULT '{}'::jsonb,  -- thresholds, isotonic params, etc

  model_artifact_uri TEXT NOT NULL,               -- where the model is stored (S3/Blob/local)
  status TEXT NOT NULL DEFAULT 'staged',          -- staged/production/deprecated

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, version_tag)
);

CREATE INDEX IF NOT EXISTS idx_model_version_model ON ml_model_version(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_version_status ON ml_model_version(status);

-- another
-- CREATE TYPE prediction_horizon AS ENUM ('1m','3m','6m','12m');
-- CREATE TYPE prediction_kind AS ENUM ('classification','regression');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prediction_horizon') THEN
    CREATE TYPE prediction_horizon AS ENUM ('1m','3m','6m','12m');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prediction_kind') THEN
    CREATE TYPE prediction_kind AS ENUM ('classification','regression');
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS ml_prediction (
  prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  model_version_id UUID NOT NULL REFERENCES ml_model_version(model_version_id) ON DELETE RESTRICT,
  enterprise_id UUID NOT NULL REFERENCES dim_enterprise(enterprise_id) ON DELETE CASCADE,

  as_of_date DATE NOT NULL,                      -- date prediction made
  horizon prediction_horizon NOT NULL DEFAULT '3m',

  kind prediction_kind NOT NULL,
  target_key TEXT NOT NULL,                      -- e.g. "risk_tier", "jobs_created", "jobs_lost", "revenue"
  predicted_value NUMERIC(18,6),                 -- regression output
  predicted_label TEXT,                          -- classification label e.g. "LOW/MEDIUM/HIGH"
  confidence NUMERIC(6,5),                       -- 0..1

  explanation JSONB NOT NULL DEFAULT '{}'::jsonb, -- top features, SHAP summary, reason codes
  input_snapshot_ref TEXT,                       -- pointer to feature vector snapshot/artifact

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_version_id, enterprise_id, as_of_date, horizon, target_key)
);

CREATE INDEX IF NOT EXISTS idx_pred_enterprise_date ON ml_prediction(enterprise_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_pred_model_date ON ml_prediction(model_version_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_pred_target ON ml_prediction(target_key);
CREATE INDEX IF NOT EXISTS idx_pred_expl_gin ON ml_prediction USING GIN(explanation);

CREATE TABLE IF NOT EXISTS sim_scenario (
  scenario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name TEXT NOT NULL,
  scenario_type TEXT NOT NULL DEFAULT 'shock',    -- shock / policy / funding / compound
  description TEXT,
  parameters JSONB NOT NULL,                      -- e.g. {"inflation":0.15,"fx_depr":0.10,"aid_cut":0.20}
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sim_run (
  sim_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES sim_scenario(scenario_id) ON DELETE CASCADE,
  model_version_id UUID REFERENCES ml_model_version(model_version_id) ON DELETE SET NULL,

  scope JSONB NOT NULL DEFAULT '{}'::jsonb,       -- e.g. {"country":"RW","cohort_id":"..."} or list of enterprises
  run_status TEXT NOT NULL DEFAULT 'running',     -- running/succeeded/failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sim_result (
  sim_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sim_run_id UUID NOT NULL REFERENCES sim_run(sim_run_id) ON DELETE CASCADE,
  enterprise_id UUID REFERENCES dim_enterprise(enterprise_id) ON DELETE CASCADE,

  target_key TEXT NOT NULL,                       -- risk_tier/revenue/jobs_created/jobs_lost etc
  baseline_value NUMERIC(18,6),
  scenario_value NUMERIC(18,6),
  delta_value NUMERIC(18,6),

  baseline_label TEXT,
  scenario_label TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simrun_scenario ON sim_run(scenario_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_simres_run ON sim_result(sim_run_id);
CREATE INDEX IF NOT EXISTS idx_simres_enterprise ON sim_result(enterprise_id);



CREATE TABLE IF NOT EXISTS rag_document (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_title TEXT NOT NULL,
  doc_type TEXT NOT NULL,                         -- policy/playbook/training/faq
  source_uri TEXT,                                -- where original doc lives
  country_code TEXT REFERENCES ref_country(country_code),
  program_id UUID REFERENCES ref_program(program_id),
  version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_chunk (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES rag_document(doc_id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  tokens_est INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional pgvector embedding
--   embedding vector(768),
  embedding JSONB,


  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_doc_active ON rag_document(is_active);
CREATE INDEX IF NOT EXISTS idx_rag_chunk_doc ON rag_chunk(doc_id);
-- Optional ANN index if using pgvector
-- CREATE INDEX IF NOT EXISTS idx_rag_chunk_embedding ON rag_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS rag_query_log (
  rag_query_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query_text TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,       -- policy filters, country/program constraints
  top_k INT NOT NULL DEFAULT 5,
  response_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag_citation (
  rag_citation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_query_id UUID NOT NULL REFERENCES rag_query_log(rag_query_id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES rag_chunk(chunk_id) ON DELETE RESTRICT,
  rank INT NOT NULL,
  score NUMERIC(10,6),
  quoted_span JSONB NOT NULL DEFAULT '{}'::jsonb     -- optional: {"start":..,"end":..}
);

CREATE INDEX IF NOT EXISTS idx_rag_citation_query ON rag_citation(rag_query_id, rank);



CREATE TABLE IF NOT EXISTS auth_user (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_role (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT UNIQUE NOT NULL,         -- "admin", "program_manager", "analyst", "advisor", "donor_view"
  role_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_user_role (
  user_id UUID NOT NULL REFERENCES auth_user(user_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES auth_role(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Optional scoping (country/program level)
CREATE TABLE IF NOT EXISTS auth_scope (
  scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_user(user_id) ON DELETE CASCADE,
  country_code TEXT REFERENCES ref_country(country_code),
  program_id UUID REFERENCES ref_program(program_id),
  cohort_id UUID REFERENCES ref_cohort(cohort_id),
  scope_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_scope_user ON auth_scope(user_id);


--
 CREATE TABLE IF NOT EXISTS audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth_user(user_id) ON DELETE SET NULL,

  action TEXT NOT NULL,                 -- e.g. "VIEW_DASHBOARD", "EXPORT_DATA", "RUN_INFERENCE", "RUN_SCENARIO", "RAG_QUERY"
  resource_type TEXT,                   -- "enterprise", "cohort", "model", "scenario", "rag"
  resource_id UUID,

  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ip, user-agent, endpoint, filters
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);


CREATE TABLE IF NOT EXISTS dq_contract (
  dq_contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_name TEXT NOT NULL,
  description TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,        -- e.g. {"country":"RW","dataset":"kpi_snapshot"}
  rules JSONB NOT NULL,                             -- thresholds: completeness, timeliness, validity
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dq_report (
  dq_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dq_contract_id UUID NOT NULL REFERENCES dq_contract(dq_contract_id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  results JSONB NOT NULL,                           -- measured values vs thresholds
  status TEXT NOT NULL,                             -- pass/warn/fail
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dq_contract_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_dq_report_date ON dq_report(as_of_date DESC);



















