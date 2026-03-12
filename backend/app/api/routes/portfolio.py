from fastapi import APIRouter, Depends
from app.api.deps import get_current_user

# TODO: Migration from MongoDB to PostgreSQL in progress
# Portfolio endpoints currently return stub data
# These need to be reimplemented with PostgreSQL queries once loan/portfolio tables are created

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/summary")
async def portfolio_summary(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns stub data until PostgreSQL loan tables are created and populated
    """
    return {
        "total_loans": 0,
        "total_disbursed": 0.0,
        "total_outstanding": 0.0,
        "avg_days_in_arrears": 0.0,
        "par30_amount": 0.0,
    }


@router.get("/by-country")
async def portfolio_by_country(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns empty list until PostgreSQL loan tables are created and populated
    """
    return []


@router.get("/loans")
async def portfolio_loans(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns empty list until PostgreSQL loan tables are created and populated
    """
    return []


@router.get("/overview")
async def portfolio_overview(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns stub data until PostgreSQL loan and impact tables are created and populated
    """
    return {
        "total_loans": 0,
        "total_disbursed": 0.0,
        "total_outstanding": 0.0,
        "avg_days_in_arrears": 0.0,
        "par30_amount": 0.0,
        "jobs_created_3m": 0,
        "jobs_lost_3m": 0,
        "avg_revenue_3m": 0.0,
        "nps_promoter": 0,
        "nps_detractor": 0,
    }


@router.get("/risk-distribution")
async def portfolio_risk_distribution(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns empty list until PostgreSQL loan tables are created and populated
    """
    return []


@router.get("/jobs-summary")
async def portfolio_jobs_summary(current_user=Depends(get_current_user)):
    """
    TODO: Migrate to PostgreSQL
    Returns stub data until PostgreSQL impact tables are created and populated
    """
    return {
        "created": 0,
        "lost": 0,
    }
