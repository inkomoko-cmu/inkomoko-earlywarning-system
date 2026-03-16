\set ON_ERROR_STOP on

-- Phase 1 MVP settings storage for AI-powered fintech early warning
CREATE TABLE IF NOT EXISTS app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  risk_thresholds JSONB NOT NULL,
  prediction_horizons JSONB NOT NULL,
  retraining JSONB NOT NULL,
  cron_jobs JSONB NOT NULL,
  alert_rules JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES auth_user(user_id) ON DELETE SET NULL
);

INSERT INTO app_settings (
  id,
  risk_thresholds,
  prediction_horizons,
  retraining,
  cron_jobs,
  alert_rules
)
VALUES (
  1,
  '{"low":{"score_min":0,"score_max":30,"arrears_days":7,"revenue_decline_pct":10,"jobs_lost_pct":5},"medium":{"score_min":31,"score_max":70,"arrears_days":30,"revenue_decline_pct":25,"jobs_lost_pct":15},"high":{"score_min":71,"score_max":100,"arrears_days":31,"revenue_decline_pct":40,"jobs_lost_pct":25},"high_if_any_triggered":true}'::jsonb,
  '{"one_month":{"enabled":true,"confidence_interval":95,"min_confidence_pct":75},"two_month":{"enabled":true,"confidence_interval":90,"min_confidence_pct":70},"three_month":{"enabled":true,"confidence_interval":85,"min_confidence_pct":65},"recompute_frequency":"daily"}'::jsonb,
  '{"enabled":true,"frequency":"monthly","run_time_utc":"02:00","training_window_months":24,"auto_deploy":false,"min_improvement_pct":2.0}'::jsonb,
  '{"loan_import":{"enabled":true,"frequency":"daily","run_time_utc":"01:00","max_retries":3},"impact_import":{"enabled":true,"frequency":"weekly","run_time_utc":"01:30","max_retries":3},"retraining_job":{"enabled":true,"frequency":"monthly","run_time_utc":"02:00","max_retries":1}}'::jsonb,
  '{"high_risk_enabled":true,"high_risk_threshold_count":10,"par30_enabled":true,"par30_threshold_pct":20,"import_failure_enabled":true,"delivery_channel":"in_app","recipient_email":null}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
