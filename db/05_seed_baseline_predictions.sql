-- Seed baseline ML predictions for scenario simulation
-- This populates the ml_prediction table with synthetic baseline data
-- so that scenario runs have baseline predictions to work from.

\set ON_ERROR_STOP on

-- 1. Create ML Models (required for model versions)
INSERT INTO ml_model (
  model_id,
  model_key,
  model_name,
  task_type,
  target_description
) VALUES
  ('b0000001-0000-0000-0000-000000000001'::uuid, 'REVENUE_FORECAST', 'Revenue Forecast', 'regression', 'Enterprise revenue prediction'),
  ('b0000002-0000-0000-0000-000000000002'::uuid, 'RISK_SCORE', 'Risk Score', 'classification', 'Enterprise risk tier prediction'),
  ('b0000003-0000-0000-0000-000000000003'::uuid, 'JOBS_CREATED', 'Jobs Created', 'regression', 'Employment creation prediction'),
  ('b0000004-0000-0000-0000-000000000004'::uuid, 'JOBS_LOST', 'Jobs Lost', 'regression', 'Employment loss prediction')
ON CONFLICT (model_key) DO NOTHING;

-- 2. Create ML Model Versions
INSERT INTO ml_model_version (
  model_version_id,
  model_id,
  version_tag,
  algorithm,
  model_artifact_uri,
  status
) VALUES
  ('a1234567-1234-1234-1234-123456789012'::uuid, 'b0000001-0000-0000-0000-000000000001'::uuid, 'v1.0.0', 'RandomForestRegressor', 's3://mock/revenue_v1.joblib', 'production'),
  ('a2234567-1234-1234-1234-123456789012'::uuid, 'b0000002-0000-0000-0000-000000000002'::uuid, 'v1.0.0', 'RandomForestClassifier', 's3://mock/risk_v1.joblib', 'production'),
  ('a3234567-1234-1234-1234-123456789012'::uuid, 'b0000003-0000-0000-0000-000000000003'::uuid, 'v1.0.0', 'RandomForestRegressor', 's3://mock/jobs_created_v1.joblib', 'production'),
  ('a4234567-1234-1234-1234-123456789012'::uuid, 'b0000004-0000-0000-0000-000000000004'::uuid, 'v1.0.0', 'RandomForestRegressor', 's3://mock/jobs_lost_v1.joblib', 'production')
ON CONFLICT (model_version_id) DO NOTHING;

-- 3. Seed baseline predictions for all enterprises
-- This creates predictions for all horizons and target keys that scenario simulation needs
INSERT INTO ml_prediction (
  prediction_id,
  model_version_id,
  enterprise_id,
  as_of_date,
  horizon,
  kind,
  target_key,
  predicted_value,
  predicted_label,
  confidence,
  explanation
)
SELECT
  gen_random_uuid()::uuid,
  CASE k.base_key
    WHEN 'revenue' THEN 'a1234567-1234-1234-1234-123456789012'::uuid
    WHEN 'risk_tier' THEN 'a2234567-1234-1234-1234-123456789012'::uuid
    WHEN 'jobs_created' THEN 'a3234567-1234-1234-1234-123456789012'::uuid
    WHEN 'jobs_lost' THEN 'a4234567-1234-1234-1234-123456789012'::uuid
  END as model_version_id,
  e.enterprise_id,
  CURRENT_DATE::date as as_of_date,
  h.horizon,
  k.kind,
  (k.base_key || '_' || h.horizon)::text as target_key,
  k.predicted_value + (random() * 1000)::numeric(18,6) as predicted_value,
  k.predicted_label,
  (0.7 + random() * 0.25)::numeric(6,5) as confidence,
  jsonb_build_object(
    'algorithm', 'RandomForestRegressor',
    'features_used', jsonb_build_array('history', 'macro_indicators', 'enterprise_profile'),
    'top_feature', 'revenue_growth_history',
    'synthetic_seed', true
  ) as explanation
FROM
  dim_enterprise e
CROSS JOIN (
  SELECT '1m' as horizon
  UNION ALL SELECT '3m'
  UNION ALL SELECT '6m'
  UNION ALL SELECT '12m'
) h
CROSS JOIN (
  SELECT 'risk_tier' as base_key, 'classification' as kind, 2.5::numeric as predicted_value, 'MEDIUM'::text as predicted_label
  UNION ALL SELECT 'revenue', 'regression', 150000.00, 'GROWTH'
  UNION ALL SELECT 'jobs_created', 'regression', 12.00, 'POSITIVE'
  UNION ALL SELECT 'jobs_lost', 'regression', 3.00, 'LOW'
) k
ON CONFLICT DO NOTHING;

-- Verify we have predictions now
SELECT
  COUNT(*) as total_predictions,
  COUNT(DISTINCT enterprise_id) as enterprises_with_predictions,
  COUNT(DISTINCT horizon) as horizons_covered,
  COUNT(DISTINCT target_key) as target_keys_seeded
FROM ml_prediction;
