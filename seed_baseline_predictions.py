#!/usr/bin/env python3
"""
Seed the ml_prediction table with baseline data for scenario simulation testing.

This script:
1. Creates a demo ML model version (required FK)
2. Inserts synthetic baseline predictions for all enterprises
3. Verifies the data is loaded

Usage:
    python seed_baseline_predictions.py
    
Or with custom connection:
    DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db python seed_baseline_predictions.py
"""

import asyncio
import os
import sys
from uuid import UUID

from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


async def main():
    # Get database URL from environment or use default
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://inkomoko_app:StrongPass2026@localhost:5432/inkomoko_early_warning"
    )
    
    print(f"Connecting to: {db_url.split('@')[1] if '@' in db_url else 'database'}")
    
    try:
        engine = create_async_engine(db_url, echo=False)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as session:
            # Step 1: Create ML models and versions
            print("\n[1/3] Creating demo ML models...")
            
            # Create base models
            await session.execute(text("""
                INSERT INTO ml_model (
                  model_id, model_key, model_name, task_type, target_description
                ) VALUES
                  ('b0000001-0000-0000-0000-000000000001'::uuid, 'REVENUE_FORECAST', 'Revenue Forecast', 'regression', 'Enterprise revenue prediction'),
                  ('b0000002-0000-0000-0000-000000000002'::uuid, 'RISK_SCORE', 'Risk Score', 'classification', 'Enterprise risk tier prediction'),
                  ('b0000003-0000-0000-0000-000000000003'::uuid, 'JOBS_CREATED', 'Jobs Created', 'regression', 'Employment creation prediction'),
                  ('b0000004-0000-0000-0000-000000000004'::uuid, 'JOBS_LOST', 'Jobs Lost', 'regression', 'Employment loss prediction')
                ON CONFLICT (model_key) DO NOTHING
            """))
            
            # Create model version
            await session.execute(text("""
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
                ON CONFLICT (model_version_id) DO NOTHING
            """))
            await session.commit()
            print("  ✓ ML models and versions created")
            
            # Step 2: Check how many enterprises exist, create demo if needed
            enterprise_count = await session.scalar(
                text("SELECT COUNT(*) FROM dim_enterprise")
            )
            print(f"\n[2/3] Found {enterprise_count} existing enterprises")
            
            if enterprise_count == 0:
                print("  ⚠ No enterprises found. Creating demo baseline...")
                
                # Create countries first
                await session.execute(text("""
                    INSERT INTO ref_country (country_code, country_name)
                    VALUES
                      ('RW', 'Rwanda'),
                      ('KE', 'Kenya'),
                      ('UG', 'Uganda'),
                      ('ET', 'Ethiopia')
                    ON CONFLICT (country_code) DO NOTHING
                """))
                await session.commit()
                
                # Create demo clients
                await session.execute(text("""
                    INSERT INTO dim_client (
                      external_client_key,
                      country_code
                    ) VALUES
                      ('DEMO_CLIENT_RW_001', 'RW'),
                      ('DEMO_CLIENT_KE_001', 'KE'),
                      ('DEMO_CLIENT_UG_001', 'UG'),
                      ('DEMO_CLIENT_ET_001', 'ET'),
                      ('DEMO_CLIENT_RW_002', 'RW')
                    ON CONFLICT DO NOTHING
                """))
                await session.commit()
                
                # Now create enterprises
                await session.execute(text("""
                    INSERT INTO dim_enterprise (
                      client_id,
                      external_enterprise_key,
                      sector
                    ) SELECT
                      c.client_id,
                      'DEMO_ENTERPRISE_' || c.external_client_key,
                      s.sector
                    FROM dim_client c
                    CROSS JOIN (
                      SELECT 'Agriculture' as sector
                      UNION ALL SELECT 'Retail'
                      UNION ALL SELECT 'Manufacturing'
                      UNION ALL SELECT 'Services'
                      UNION ALL SELECT 'Trade'
                    ) s
                    WHERE c.external_client_key LIKE 'DEMO_%'
                    ON CONFLICT DO NOTHING
                """))
                await session.commit()
                
                # Recount
                enterprise_count = await session.scalar(
                    text("SELECT COUNT(*) FROM dim_enterprise")
                )
                print(f"  ✓ Created {enterprise_count} demo enterprises")
            
            # Step 3: Seed predictions
            print(f"\n[3/3] Seeding baseline predictions for {enterprise_count} enterprises...")
            
            await session.execute(text("""
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
                  END,
                  e.enterprise_id,
                  CURRENT_DATE::date,
                  h.horizon::prediction_horizon as horizon,
                  k.kind::prediction_kind as kind,
                  (k.base_key || '_' || h.horizon)::text,
                  k.predicted_value + (random() * 1000)::numeric(18,6),
                  k.predicted_label,
                  (0.7 + random() * 0.25)::numeric(6,5),
                  jsonb_build_object(
                    'algorithm', k.algorithm,
                    'features_used', jsonb_build_array('history', 'macro', 'profile'),
                    'top_feature', 'revenue_history',
                    'synthetic_seed', true
                  )
                FROM dim_enterprise e
                CROSS JOIN (
                  SELECT '1m' as horizon UNION ALL
                  SELECT '3m' UNION ALL
                  SELECT '6m' UNION ALL
                  SELECT '12m'
                ) h
                CROSS JOIN (
                  SELECT 'risk_tier' as base_key, 'classification' as kind, 'RandomForestClassifier' as algorithm, 2.5::numeric as predicted_value, 'MEDIUM'::text as predicted_label
                  UNION ALL SELECT 'revenue', 'regression', 'RandomForestRegressor', 150000.00, 'GROWTH'
                  UNION ALL SELECT 'jobs_created', 'regression', 'RandomForestRegressor', 12.00, 'POSITIVE'
                  UNION ALL SELECT 'jobs_lost', 'regression', 'RandomForestRegressor', 3.00, 'LOW'
                ) k
                ON CONFLICT DO NOTHING
            """))
            await session.commit()
            
            # Verify
            total_preds = await session.scalar(
                text("SELECT COUNT(*) FROM ml_prediction")
            )
            horizons = await session.scalars(
                text("SELECT DISTINCT horizon FROM ml_prediction ORDER BY horizon")
            )
            target_keys = await session.scalars(
                text("SELECT DISTINCT target_key FROM ml_prediction ORDER BY target_key")
            )
            
            print(f"\n✓ Successfully seeded {total_preds} baseline predictions")
            print(f"  • Horizons: {', '.join(horizons)}")
            print(f"  • Target keys: {', '.join(target_keys)}")
            print(f"\n✓ Ready for scenario simulation!")
            print(f"\nNext steps:")
            print(f"  1. Go to http://localhost:3000 (frontend)")
            print(f"  2. Navigate to Scenarios")
            print(f"  3. Select a scenario and click 'Manually Run Simulation'")
            print(f"  4. You should now see revenue, risk, and job predictions")
            
        await engine.dispose()
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
