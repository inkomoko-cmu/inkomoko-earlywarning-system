from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.crud.analytics import (
    get_portfolio_summary,
    get_risk_distribution,
    get_monthly_trends,
    get_by_country,
    get_by_sector,
    get_portfolio_deltas,
    get_loans,
)
from app.schemas.portfolio import (
    PortfolioOverviewResponse,
    RiskDistributionItem,
    TrendsResponse,
    SegmentResponse,
    SegmentItem,
    CountryLoanItem,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/overview", response_model=PortfolioOverviewResponse)
async def portfolio_overview(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get headline portfolio overview metrics from core_banking_loans and impact_data.
    
    Returns loan portfolio KPIs, impact metrics, risk distribution, and delta indicators
    for dashboard rendering.
    """
    summary = await get_portfolio_summary(db, country_code=country_code)
    deltas = await get_portfolio_deltas(db, country_code=country_code)
    
    return PortfolioOverviewResponse(
        total_loans=summary['total_loans'],
        total_disbursed=summary['total_disbursed'],
        total_outstanding=summary['total_outstanding'],
        avg_days_in_arrears=summary['avg_days_in_arrears'],
        par30_pct=summary['par30_pct'],
        par30_amount=summary['par30_amount'],
        defaulted_count=summary['defaulted_count'],
        closed_count=summary['closed_count'],
        active_count=summary['active_count'],
        avg_revenue_3m=summary['avg_revenue_3m'],
        total_jobs_created_3m=summary['total_jobs_created_3m'],
        total_jobs_lost_3m=summary['total_jobs_lost_3m'],
        nps_promoter_pct=summary['nps_promoter_pct'],
        nps_detractor_pct=summary['nps_detractor_pct'],
        high_risk_count=summary['high_risk_count'],
        medium_risk_count=summary['medium_risk_count'],
        low_risk_count=summary['low_risk_count'],
        revenue_delta_pct=deltas['revenue_delta_pct'],
        risk_trend=deltas['risk_trend'],
    )


@router.get("/risk-distribution", response_model=list[RiskDistributionItem])
async def portfolio_risk_distribution(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get risk tier distribution from latest impact data surveys.
    
    Returns counts and percentages for LOW/MEDIUM/HIGH risk tiers.
    """
    return await get_risk_distribution(db, country_code=country_code)


@router.get("/jobs-summary")
async def portfolio_jobs_summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get employment metrics summary (3-month horizon).
    
    Returns total jobs created and lost across portfolio.
    """
    summary = await get_portfolio_summary(db, country_code=country_code)
    return {
        "created": summary['total_jobs_created_3m'],
        "lost": summary['total_jobs_lost_3m'],
    }


@router.get("/trends", response_model=TrendsResponse)
async def portfolio_trends(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
    months: int = Query(24, ge=1, le=60),
):
    """
    Get monthly time series for revenue and employment with confidence intervals.
    
    Useful for trend charts and forecasting context.
    """
    return await get_monthly_trends(db, country_code=country_code, months_back=months)


@router.get("/by-country", response_model=list[CountryLoanItem])
async def portfolio_by_country(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get portfolio metrics broken down by country.
    
    Useful for geographic heatmaps and segmentation analysis.
    """
    return await get_by_country(db)


@router.get("/by-sector", response_model=list[SegmentItem])
async def portfolio_by_sector(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get portfolio metrics broken down by business sector.
    
    Useful for sector concentration analysis and risk visualization.
    """
    return await get_by_sector(db)


@router.get("/loans")
async def portfolio_loans(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get individual loan records from the portfolio.
    
    Returns loan-level data for table: numbers, amounts, status, arrears days.
    Optionally filter by country code.
    """
    return await get_loans(db, country_code=country_code)
