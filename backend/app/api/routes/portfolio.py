from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.deps import get_current_user

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/summary")
async def portfolio_summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT
            COUNT(*) AS total_loans,
            ROUND(SUM(disbursedamount), 2) AS total_disbursed,
            ROUND(SUM(currentbalance), 2) AS total_outstanding,
            ROUND(AVG(daysinarrears), 2) AS avg_days_in_arrears,
            ROUND(SUM(CASE WHEN daysinarrears > 30 THEN currentbalance ELSE 0 END), 2) AS par30_amount
        FROM raw_core_banking_loans
    """))
    row = result.mappings().first()
    return dict(row)


@router.get("/by-country")
async def portfolio_by_country(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT
            country_code,
            COUNT(*) AS loans,
            ROUND(SUM(disbursedamount), 2) AS total_disbursed,
            ROUND(SUM(currentbalance), 2) AS total_outstanding
        FROM raw_core_banking_loans
        GROUP BY country_code
        ORDER BY loans DESC
    """))
    rows = result.mappings().all()
    return [dict(r) for r in rows]

@router.get("/loans")
async def portfolio_loans(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT
            loannumber,
            country_code,
            industrysectorofactivity,
            loanstatus,
            disbursedamount,
            currentbalance,
            daysinarrears,
            installmentinarrears
        FROM raw_core_banking_loans
        ORDER BY disbursementdate DESC
        LIMIT 200
    """))

    rows = result.mappings().all()
    return [dict(r) for r in rows]

@router.get("/overview")
async def portfolio_overview(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        WITH loans AS (
            SELECT
                COUNT(*) AS total_loans,
                ROUND(SUM(disbursedamount), 2) AS total_disbursed,
                ROUND(SUM(currentbalance), 2) AS total_outstanding,
                ROUND(AVG(daysinarrears), 2) AS avg_days_in_arrears,
                ROUND(SUM(CASE WHEN daysinarrears > 30 THEN currentbalance ELSE 0 END), 2) AS par30_amount
            FROM raw_core_banking_loans
        ),
        impact AS (
            SELECT
                COALESCE(SUM(jobs_created_3m), 0) AS jobs_created_3m,
                COALESCE(SUM(jobs_lost_3m), 0) AS jobs_lost_3m,
                ROUND(COALESCE(AVG(revenue_3m), 0), 2) AS avg_revenue_3m,
                COALESCE(SUM(nps_promoter), 0) AS nps_promoter,
                COALESCE(SUM(nps_detractor), 0) AS nps_detractor
            FROM raw_impact_data
        )
        SELECT
            loans.total_loans,
            loans.total_disbursed,
            loans.total_outstanding,
            loans.avg_days_in_arrears,
            loans.par30_amount,
            impact.jobs_created_3m,
            impact.jobs_lost_3m,
            impact.avg_revenue_3m,
            impact.nps_promoter,
            impact.nps_detractor
        FROM loans, impact
    """))
    row = result.mappings().first()
    return dict(row)

@router.get("/risk-distribution")
async def portfolio_risk_distribution(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT
            CASE
                WHEN daysinarrears = 0 THEN 'Low'
                WHEN daysinarrears <= 30 THEN 'Medium'
                ELSE 'High'
            END AS name,
            COUNT(*) AS value
        FROM raw_core_banking_loans
        GROUP BY
            CASE
                WHEN daysinarrears = 0 THEN 'Low'
                WHEN daysinarrears <= 30 THEN 'Medium'
                ELSE 'High'
            END
        ORDER BY name
    """))
    rows = result.mappings().all()
    return [dict(r) for r in rows]

@router.get("/jobs-summary")
async def portfolio_jobs_summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(text("""
        SELECT
            COALESCE(SUM(jobs_created_3m), 0) AS created,
            COALESCE(SUM(jobs_lost_3m), 0) AS lost
        FROM raw_impact_data
    """))
    row = result.mappings().first()
    return dict(row)