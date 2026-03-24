from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.api.deps import (
    get_current_user,
    get_db,
    enforce_country_scope,
    get_scope_country_codes,
)
from app.crud.analytics import (
    get_portfolio_summary,
    get_risk_distribution,
    get_monthly_trends,
    get_by_country,
    get_by_sector,
    get_portfolio_deltas,
    get_loans,
    get_enterprise_profiles,
    get_enterprise_profile_detail,
    get_sector_risk_summary,
    get_country_comparison,
    get_anomaly_signals,
    get_portfolio_composition,
    get_risk_migration,
    get_performance_distribution,
    get_correlation_drivers,
    get_quality_ops,
)
from app.schemas.portfolio import (
    PortfolioOverviewResponse,
    RiskDistributionItem,
    TrendsResponse,
    SegmentResponse,
    SegmentItem,
    CountryLoanItem,
    EnterpriseProfileItem,
    EnterpriseDetailResponse,
    SectorRiskSummaryItem,
    CountryComparisonItem,
    AnomalySignalItem,
    PortfolioCompositionResponse,
    RiskMigrationItem,
    PerformanceDistributionItem,
    CorrelationDriverItem,
    QualityOpsItem,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])
logger = logging.getLogger(__name__)


@router.get("/overview", response_model=PortfolioOverviewResponse)
async def portfolio_overview(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get headline portfolio overview metrics from curated anonymized portfolio views.
    
    Returns loan portfolio KPIs, impact metrics, risk distribution, and delta indicators
    for dashboard rendering.
    """
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        summary = await get_portfolio_summary(db, country_code=country_code)
        deltas = await get_portfolio_deltas(db, country_code=country_code)
    except Exception:
        logger.exception("portfolio_overview failed")
        summary = {
            'total_loans': 0,
            'total_disbursed': 0,
            'total_outstanding': 0,
            'avg_days_in_arrears': 0,
            'par30_pct': 0,
            'par30_amount': 0,
            'defaulted_count': 0,
            'closed_count': 0,
            'active_count': 0,
            'avg_revenue_3m': 0,
            'total_jobs_created_3m': 0,
            'total_jobs_lost_3m': 0,
            'nps_promoter_pct': 0,
            'nps_detractor_pct': 0,
            'high_risk_count': 0,
            'medium_risk_count': 0,
            'low_risk_count': 0,
        }
        deltas = {'revenue_delta_pct': 0, 'risk_trend': 'stable'}
    
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
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        return await get_risk_distribution(db, country_code=country_code)
    except Exception:
        logger.exception("portfolio_risk_distribution failed")
        return []


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
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        summary = await get_portfolio_summary(db, country_code=country_code)
    except Exception:
        logger.exception("portfolio_jobs_summary failed")
        summary = {'total_jobs_created_3m': 0, 'total_jobs_lost_3m': 0}
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
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        return await get_monthly_trends(db, country_code=country_code, months_back=months)
    except Exception:
        logger.exception("portfolio_trends failed")
        return {'revenue': [], 'jobs_created': []}


@router.get("/by-country", response_model=list[CountryLoanItem])
async def portfolio_by_country(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get portfolio metrics broken down by country.
    
    Useful for geographic heatmaps and segmentation analysis.
    """
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_by_country(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_by_country failed")
        return []


@router.get("/by-sector", response_model=list[SegmentItem])
async def portfolio_by_sector(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get portfolio metrics broken down by business sector.
    
    Useful for sector concentration analysis and risk visualization.
    """
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_by_sector(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_by_sector failed")
        return []


@router.get("/sector-risk-summary", response_model=list[SectorRiskSummaryItem])
async def portfolio_sector_risk_summary(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    limit: int = Query(12, ge=3, le=30),
):
    """Sector leaderboard with risk, revenue, and jobs context."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_sector_risk_summary(db, country_codes=allowed_countries, limit=limit)
    except Exception:
        logger.exception("portfolio_sector_risk_summary failed")
        return []


@router.get("/country-comparison", response_model=list[CountryComparisonItem])
async def portfolio_country_comparison(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Cross-country executive KPI comparison."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_country_comparison(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_country_comparison failed")
        return []


@router.get("/anomaly-signals", response_model=list[AnomalySignalItem])
async def portfolio_anomaly_signals(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Threshold-based anomaly alerts for executive review."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_anomaly_signals(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_anomaly_signals failed")
        return []


@router.get("/composition", response_model=PortfolioCompositionResponse)
async def portfolio_composition(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Portfolio composition slices for country, sector, and risk tier charts."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_portfolio_composition(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_composition failed")
        return {'sectors': [], 'countries': [], 'risk_tiers': []}


@router.get("/risk-migration", response_model=list[RiskMigrationItem])
async def portfolio_risk_migration(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Month-over-month risk tier movement estimates by country."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_risk_migration(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_risk_migration failed")
        return []


@router.get("/performance-distribution", response_model=list[PerformanceDistributionItem])
async def portfolio_performance_distribution(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Revenue-band performance distribution with risk and jobs context."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_performance_distribution(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_performance_distribution failed")
        return []


@router.get("/correlation-drivers", response_model=list[CorrelationDriverItem])
async def portfolio_correlation_drivers(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Correlation-driven explanatory analytics for executive interpretation."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_correlation_drivers(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_correlation_drivers failed")
        return []


@router.get("/quality-ops", response_model=list[QualityOpsItem])
async def portfolio_quality_ops(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Operational quality metrics for analytics reliability and governance."""
    try:
        allowed_countries = await get_scope_country_codes(current_user, db)
        return await get_quality_ops(db, country_codes=allowed_countries)
    except Exception:
        logger.exception("portfolio_quality_ops failed")
        return []


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
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        return await get_loans(db, country_code=country_code)
    except Exception:
        logger.exception("portfolio_loans failed")
        return []


@router.get("/enterprises", response_model=list[EnterpriseProfileItem])
async def portfolio_enterprises(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    country_code: Optional[str] = Query(None),
):
    """
    Get enterprise-level profiles from curated anonymized impact view.

    Returns unique enterprise IDs (e.g. U01097) with risk, revenue and job projections.
    Optionally filter by country code.
    """
    try:
        country_code = await enforce_country_scope(current_user, db, country_code)
        return await get_enterprise_profiles(db, country_code=country_code)
    except Exception:
        logger.exception("portfolio_enterprises failed")
        return []


@router.get("/enterprises/{unique_id}", response_model=EnterpriseDetailResponse)
async def portfolio_enterprise_detail(
    unique_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get detailed enterprise profile by unique ID.

    Includes related loan context, generated insights, and prioritized actions.
    """
    detail = await get_enterprise_profile_detail(db, unique_id=unique_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Enterprise {unique_id} not found")

    allowed_countries = await get_scope_country_codes(current_user, db)
    if allowed_countries is not None:
        enterprise_country = detail.get("enterprise", {}).get("country_code")
        if enterprise_country not in allowed_countries:
            raise HTTPException(status_code=403, detail="Out of scope")

    return detail
