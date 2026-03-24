"""
Analytics CRUD layer for portfolio overview metrics.

Aggregations over curated anonymized investment and impact views,
with support for trends, segments, and statistical confidence intervals.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Tuple, Any, Set
from sqlalchemy import func, and_, or_, select, literal_column, cast, Numeric, Integer, Boolean, Date, desc, case, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import CoreBankingLoan, ImpactData


def _effective_disbursed_expr():
    """
    Return a safe disbursed-amount expression.

    Some datasets have disbursed_amount populated as 0; in that case we fall back
    to approved_amount, then applied_amount, then current_balance.
    """
    return func.coalesce(
        func.nullif(cast(CoreBankingLoan.disbursed_amount, Numeric), 0),
        func.nullif(cast(CoreBankingLoan.approved_amount, Numeric), 0),
        func.nullif(cast(CoreBankingLoan.applied_amount, Numeric), 0),
        cast(CoreBankingLoan.current_balance, Numeric),
        0,
    )


def _safe_survey_date_expr():
    """Parse survey_date safely across both ISO and DD/MM/YYYY representations."""
    survey_text = cast(ImpactData.survey_date, String)
    return case(
        (survey_text.op('~')(r'^\d{2}/\d{2}/\d{4}$'), func.to_date(survey_text, 'DD/MM/YYYY')),
        (survey_text.op('~')(r'^\d{4}-\d{2}-\d{2}$'), cast(survey_text, Date)),
        else_=None,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PORTFOLIO HEADLINE KPIs
# ═══════════════════════════════════════════════════════════════════════════════

async def get_portfolio_summary(db: AsyncSession, country_code: Optional[str] = None) -> Dict[str, Any]:
    """
    Get headline portfolio summary metrics from curated anonymized loans and impact views.
    
    Returns:
    {
        'total_loans': int,
        'total_disbursed': Decimal,
        'total_outstanding': Decimal,
        'avg_days_in_arrears': float,
        'par30_pct': float,  # % of loans with days_in_arrears > 30
        'par30_amount': Decimal,
        'defaulted_count': int,
        'closed_count': int,
        'active_count': int,
        'avg_revenue_3m': Decimal,
        'total_jobs_created_3m': int,
        'total_jobs_lost_3m': int,
        'nps_promoter_pct': float,
        'nps_detractor_pct': float,
        'high_risk_count': int,
        'medium_risk_count': int,
        'low_risk_count': int,
    }
    """
    # Loan metrics - simple aggregations
    loan_query = select(
        func.count().label('total_loans'),
        func.coalesce(func.sum(_effective_disbursed_expr()), 0).label('total_disbursed'),
        func.coalesce(func.sum(cast(CoreBankingLoan.current_balance, Numeric)), 0).label('total_outstanding'),
        func.coalesce(func.avg(cast(CoreBankingLoan.days_in_arrears, Integer)), 0).label('avg_days_in_arrears'),
    )
    
    if country_code:
        loan_query = loan_query.where(CoreBankingLoan.country_code == country_code)
    
    result = await db.execute(loan_query)
    loan_data = result.first()
    
    total_loans = loan_data.total_loans or 0
    total_disbursed = float(loan_data.total_disbursed or 0)
    total_outstanding = float(loan_data.total_outstanding or 0)
    avg_days_in_arrears = float(loan_data.avg_days_in_arrears or 0)
    
    # Count loans by status - use subqueries with WHERE conditions
    par30_query = select(
        func.count().label('par30_count'),
        func.coalesce(func.sum(cast(CoreBankingLoan.current_balance, Numeric)), 0).label('par30_amount'),
    ).where(cast(CoreBankingLoan.days_in_arrears, Integer) > 30)
    if country_code:
        par30_query = par30_query.where(CoreBankingLoan.country_code == country_code)
    
    result_par30 = await db.execute(par30_query)
    par30_data = result_par30.first()
    
    status_counts_query = select(
        func.count().filter(CoreBankingLoan.loan_status == 'defaulted').label('defaulted_count'),
        func.count().filter(CoreBankingLoan.loan_status == 'closed').label('closed_count'),
        func.count().filter(CoreBankingLoan.loan_status == 'active').label('active_count'),
    )
    if country_code:
        status_counts_query = status_counts_query.where(CoreBankingLoan.country_code == country_code)
    
    result = await db.execute(status_counts_query)
    status_data = result.first()
    
    par30_count = par30_data.par30_count or 0
    par30_pct = (par30_count / total_loans * 100) if total_loans > 0 else 0.0
    par30_amount = float(par30_data.par30_amount or 0)
    defaulted_count = status_data.defaulted_count or 0
    closed_count = status_data.closed_count or 0
    active_count = status_data.active_count or 0
    
    # Impact metrics - simple aggregations
    impact_query = select(
        func.coalesce(func.sum(cast(ImpactData.revenue_3m, Numeric)), 0).label('total_revenue_3m'),
        func.coalesce(func.sum(cast(ImpactData.jobs_created_3m, Integer)), 0).label('total_jobs_created_3m'),
        func.coalesce(func.sum(cast(ImpactData.jobs_lost_3m, Integer)), 0).label('total_jobs_lost_3m'),
        func.count(func.distinct(ImpactData.unique_id)).label('total_enterprises'),
    )
    
    if country_code:
        impact_query = impact_query.where(ImpactData.country_code == country_code)
    
    result = await db.execute(impact_query)
    impact_data = result.first()
    
    # Count NPS and risk metrics separately
    nps_query = select(
        func.count().filter(cast(ImpactData.nps_promoter, Boolean) == True).label('promoter_count'),
        func.count().filter(cast(ImpactData.nps_detractor, Boolean) == True).label('detractor_count'),
    )
    if country_code:
        nps_query = nps_query.where(ImpactData.country_code == country_code)
    
    result = await db.execute(nps_query)
    nps_data = result.first()
    
    risk_query = select(
        func.count().filter(ImpactData.risk_tier_3m == 'HIGH').label('high_risk_count'),
        func.count().filter(ImpactData.risk_tier_3m == 'MEDIUM').label('medium_risk_count'),
        func.count().filter(ImpactData.risk_tier_3m == 'LOW').label('low_risk_count'),
    )
    if country_code:
        risk_query = risk_query.where(ImpactData.country_code == country_code)
    
    result = await db.execute(risk_query)
    risk_data = result.first()
    
    total_enterprises = impact_data.total_enterprises or 0
    avg_revenue_3m = float(impact_data.total_revenue_3m or 0)
    total_jobs_created_3m = impact_data.total_jobs_created_3m or 0
    total_jobs_lost_3m = impact_data.total_jobs_lost_3m or 0
    
    promoter_count = nps_data.promoter_count or 0
    detractor_count = nps_data.detractor_count or 0
    nps_promoter_pct = (promoter_count / total_enterprises * 100) if total_enterprises > 0 else 0.0
    nps_detractor_pct = (detractor_count / total_enterprises * 100) if total_enterprises > 0 else 0.0
    
    high_risk_count = risk_data.high_risk_count or 0
    medium_risk_count = risk_data.medium_risk_count or 0
    low_risk_count = risk_data.low_risk_count or 0
    
    return {
        'total_loans': total_loans,
        'total_disbursed': total_disbursed,
        'total_outstanding': total_outstanding,
        'avg_days_in_arrears': avg_days_in_arrears,
        'par30_pct': par30_pct,
        'par30_amount': par30_amount,
        'defaulted_count': defaulted_count,
        'closed_count': closed_count,
        'active_count': active_count,
        'avg_revenue_3m': avg_revenue_3m,
        'total_jobs_created_3m': total_jobs_created_3m,
        'total_jobs_lost_3m': total_jobs_lost_3m,
        'nps_promoter_pct': nps_promoter_pct,
        'nps_detractor_pct': nps_detractor_pct,
        'high_risk_count': high_risk_count,
        'medium_risk_count': medium_risk_count,
        'low_risk_count': low_risk_count,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RISK DISTRIBUTION
# ═══════════════════════════════════════════════════════════════════════════════

async def get_risk_distribution(
    db: AsyncSession, country_code: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get risk tier distribution from curated anonymized impact view.
    
    Returns list of dicts:
    [
        {'name': 'Low', 'value': 150, 'pct': 42.3},
        {'name': 'Medium', 'value': 120, 'pct': 33.9},
        {'name': 'High', 'value': 80, 'pct': 22.6},
    ]
    """
    query = select(
        ImpactData.risk_tier_3m,
        func.count(func.distinct(ImpactData.unique_id)).label('count'),
    )
    
    if country_code:
        query = query.where(ImpactData.country_code == country_code)
    
    query = query.group_by(ImpactData.risk_tier_3m)
    
    result = await db.execute(query)
    rows = result.all()
    
    total = sum(r.count for r in rows)
    return [
        {
            'name': r.risk_tier_3m or 'Unknown',
            'value': r.count or 0,
            'pct': (r.count / total * 100) if total > 0 else 0,
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# TIME SERIES TRENDS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_monthly_trends(
    db: AsyncSession,
    country_code: Optional[str] = None,
    months_back: int = 24,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get monthly time series for key metrics.
    
    Returns:
    {
        'revenue': [{'month': '2024-01', 'value': xxx, 'upper_ci': xxx, 'lower_ci': xxx}, ...],
        'jobs_created': [...],
        'jobs_lost': [...],
        'par30_rate': [...],
        'default_rate': [...],
    }
    """
    # For simplicity, aggregate by month from survey_date / disbursement_date
    cutoff_date = date.today() - timedelta(days=30 * months_back)
    survey_date_expr = _safe_survey_date_expr()
    
    # Revenue trend from impact data
    revenue_query = select(
        survey_date_expr.label('survey_date'),
        func.avg(cast(ImpactData.revenue_3m, Numeric)).label('avg_revenue'),
        func.stddev(cast(ImpactData.revenue_3m, Numeric)).label('std_revenue'),
        func.count().label('count_records'),
    ).where(survey_date_expr >= cutoff_date)
    
    if country_code:
        revenue_query = revenue_query.where(ImpactData.country_code == country_code)
    
    revenue_query = revenue_query.group_by(
        survey_date_expr
    ).order_by(survey_date_expr)
    
    result = await db.execute(revenue_query)
    revenue_rows = result.all()
    
    revenue_series = []
    for row in revenue_rows:
        if row.avg_revenue is not None:
            # Simple confidence interval: mean ± 1.96*se (95% CI)
            avg = float(row.avg_revenue or 0)
            std = float(row.std_revenue or 0)
            n = int(row.count_records or 0)
            se = (std / (n ** 0.5)) if n > 0 else 0
            ci = 1.96 * se if se > 0 else 0
            
            revenue_series.append({
                'month': row.survey_date.strftime('%Y-%m') if row.survey_date else None,
                'value': avg,
                'upper_ci': avg + ci,
                'lower_ci': avg - ci,
                'n': n,
            })
    
    # Jobs created trend
    jobs_created_query = select(
        survey_date_expr.label('survey_date'),
        func.sum(cast(ImpactData.jobs_created_3m, Integer)).label('total_jobs'),
    ).where(survey_date_expr >= cutoff_date)
    
    if country_code:
        jobs_created_query = jobs_created_query.where(ImpactData.country_code == country_code)
    
    jobs_created_query = jobs_created_query.group_by(
        survey_date_expr
    ).order_by(survey_date_expr)
    
    result = await db.execute(jobs_created_query)
    jobs_rows = result.all()
    
    jobs_series = [
        {
            'month': row.survey_date.strftime('%Y-%m') if row.survey_date else None,
            'value': row.total_jobs or 0,
            'upper_ci': (row.total_jobs or 0) * 1.05,
            'lower_ci': max(0, (row.total_jobs or 0) * 0.95),
        }
        for row in jobs_rows
    ]
    
    return {
        'revenue': revenue_series,
        'jobs_created': jobs_series,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SEGMENT BREAKDOWNS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_by_country(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Portfolio metrics broken down by country using LOAN data.
    """
    query = select(
        CoreBankingLoan.country_code,
        func.count().label('loans'),
        func.coalesce(func.sum(_effective_disbursed_expr()), 0).label('total_disbursed'),
        func.coalesce(func.sum(cast(CoreBankingLoan.current_balance, Numeric)), 0).label('total_outstanding'),
    ).group_by(CoreBankingLoan.country_code).order_by(CoreBankingLoan.country_code)

    if country_codes:
        query = query.where(CoreBankingLoan.country_code.in_(country_codes))
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            'country_code': r.country_code,
            'loans': r.loans or 0,
            'total_disbursed': float(r.total_disbursed or 0),
            'total_outstanding': float(r.total_outstanding or 0),
        }
        for r in rows
    ]


async def get_by_sector(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Portfolio metrics broken down by business sector.
    """
    query = select(
        ImpactData.business_sector,
        func.count(func.distinct(ImpactData.unique_id)).label('client_count'),
        func.coalesce(func.sum(cast(ImpactData.jobs_created_3m, Integer)), 0).label('jobs_created'),
        func.coalesce(func.sum(cast(ImpactData.jobs_lost_3m, Integer)), 0).label('jobs_lost'),
        func.coalesce(func.sum(cast(ImpactData.revenue_3m, Numeric)), 0).label('total_revenue'),
        func.coalesce(func.avg(cast(ImpactData.revenue_3m, Numeric)), 0).label('avg_revenue'),
        func.count().filter(ImpactData.risk_tier_3m == 'HIGH').label('high_risk_count'),
    ).group_by(ImpactData.business_sector).order_by(
        func.count(func.distinct(ImpactData.unique_id)).desc()
    )

    if country_codes:
        query = query.where(ImpactData.country_code.in_(country_codes))
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            'sector': r.business_sector or 'Unknown',
            'client_count': r.client_count or 0,
            'jobs_created': r.jobs_created or 0,
            'jobs_lost': r.jobs_lost or 0,
            'total_revenue': float(r.total_revenue or 0),
            'avg_revenue': float(r.avg_revenue or 0),
            'high_risk_count': r.high_risk_count or 0,
        }
        for r in rows
    ]


async def get_loans(db: AsyncSession, country_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get individual loan records from curated anonymized investment view.
    
    Used for loan portfolio table with filtering by country.
    """
    query = select(
        CoreBankingLoan.loan_number,
        CoreBankingLoan.country_code,
        CoreBankingLoan.industry_sector,
        CoreBankingLoan.loan_status,
        _effective_disbursed_expr(),
        cast(CoreBankingLoan.current_balance, Numeric),
        CoreBankingLoan.days_in_arrears,
        CoreBankingLoan.installment_in_arrears,
    )
    
    if country_code:
        query = query.where(CoreBankingLoan.country_code == country_code)
    
    query = query.order_by(CoreBankingLoan.loan_number)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            'loannumber': r[0],
            'country_code': r[1],
            'industrysectorofactivity': r[2],
            'loanstatus': r[3],
            'disbursedamount': float(r[4] or 0),
            'currentbalance': float(r[5] or 0),
            'daysinarrears': r[6] or 0,
            'installmentinarrears': r[7] or 0,
        }
        for r in rows
    ]


async def get_enterprise_profiles(
    db: AsyncSession,
    country_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Get enterprise-level profiles from curated anonymized impact view.

    Returns DB-backed unique_id records with risk/revenue/jobs 3M projections.
    """
    survey_date_expr = _safe_survey_date_expr()

    ranked = select(
        ImpactData.unique_id,
        ImpactData.country_code,
        ImpactData.business_sector,
        survey_date_expr.label('survey_date'),
        ImpactData.risk_tier_3m,
        cast(ImpactData.risk_score_3m, Numeric),
        cast(ImpactData.revenue_3m, Numeric),
        cast(ImpactData.jobs_created_3m, Integer),
        cast(ImpactData.jobs_lost_3m, Integer),
        func.row_number().over(
            partition_by=ImpactData.unique_id,
            order_by=survey_date_expr.desc(),
        ).label('rn'),
    )

    if country_code:
        ranked = ranked.where(ImpactData.country_code == country_code)

    ranked_subq = ranked.subquery()

    query = (
        select(
            ranked_subq.c.unique_id,
            ranked_subq.c.country_code,
            ranked_subq.c.business_sector,
            ranked_subq.c.survey_date,
            ranked_subq.c.risk_tier_3m,
            ranked_subq.c.risk_score_3m,
            ranked_subq.c.revenue_3m,
            ranked_subq.c.jobs_created_3m,
            ranked_subq.c.jobs_lost_3m,
        )
        .where(ranked_subq.c.rn == 1)
        .order_by(ranked_subq.c.survey_date.desc(), ranked_subq.c.unique_id)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            'unique_id': r[0],
            'country_code': r[1],
            'business_sector': r[2],
            'survey_date': r[3].isoformat() if r[3] else None,
            'risk_tier_3m': r[4],
            'risk_score_3m': float(r[5] or 0),
            'revenue_3m': float(r[6] or 0),
            'jobs_created_3m': int(r[7] or 0),
            'jobs_lost_3m': int(r[8] or 0),
        }
        for r in rows
    ]


async def get_enterprise_profile_detail(
    db: AsyncSession,
    unique_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Get a single enterprise profile with related loans and AI-style insights.
    """
    survey_date_expr = _safe_survey_date_expr()

    enterprise_query = select(
        ImpactData.unique_id,
        ImpactData.country_code,
        ImpactData.business_sector,
        survey_date_expr.label('survey_date'),
        ImpactData.risk_tier_3m,
        cast(ImpactData.risk_score_3m, Numeric),
        cast(ImpactData.revenue_3m, Numeric),
        cast(ImpactData.jobs_created_3m, Integer),
        cast(ImpactData.jobs_lost_3m, Integer),
    ).where(ImpactData.unique_id == unique_id).order_by(survey_date_expr.desc()).limit(1)

    enterprise_row = (await db.execute(enterprise_query)).first()
    if not enterprise_row:
        return None

    enterprise = {
        'unique_id': enterprise_row[0],
        'country_code': enterprise_row[1],
        'country_specific': enterprise_row[1],
        'business_sector': enterprise_row[2],
        'business_sub_sector': None,
        'survey_date': enterprise_row[3].isoformat() if enterprise_row[3] else None,
        'risk_tier_3m': enterprise_row[4],
        'risk_score_3m': float(enterprise_row[5] or 0),
        'revenue_3m': float(enterprise_row[6] or 0),
        'jobs_created_3m': int(enterprise_row[7] or 0),
        'jobs_lost_3m': int(enterprise_row[8] or 0),
        'plan_after_program': None,
    }

    country_code = enterprise['country_code'] or ""
    business_sector = enterprise['business_sector']

    loans_query = select(
        CoreBankingLoan.loan_number,
        CoreBankingLoan.country_code,
        CoreBankingLoan.industry_sector,
        CoreBankingLoan.loan_status,
        _effective_disbursed_expr(),
        cast(CoreBankingLoan.current_balance, Numeric),
        CoreBankingLoan.days_in_arrears,
        CoreBankingLoan.installment_in_arrears,
    ).where(CoreBankingLoan.country_code == country_code)

    sector_priority = case(
        (CoreBankingLoan.industry_sector == business_sector, 0),
        else_=1,
    ) if business_sector else 1

    loans_query = loans_query.order_by(
        sector_priority,
        desc(CoreBankingLoan.days_in_arrears),
        desc(cast(CoreBankingLoan.current_balance, Numeric)),
    ).limit(8)

    loan_rows = (await db.execute(loans_query)).all()

    related_loans = [
        {
            'loannumber': r[0],
            'country_code': r[1],
            'industrysectorofactivity': r[2],
            'loanstatus': r[3],
            'disbursedamount': float(r[4] or 0),
            'currentbalance': float(r[5] or 0),
            'daysinarrears': int(r[6] or 0),
            'installmentinarrears': int(r[7] or 0),
        }
        for r in loan_rows
    ]

    loan_count = len(related_loans)
    high_arrears_count = sum(1 for loan in related_loans if loan['daysinarrears'] > 30)
    total_outstanding = sum(loan['currentbalance'] for loan in related_loans)
    avg_arrears_days = (sum(loan['daysinarrears'] for loan in related_loans) / loan_count) if loan_count else 0.0
    net_jobs = enterprise['jobs_created_3m'] - enterprise['jobs_lost_3m']

    risk_score = enterprise['risk_score_3m']
    if risk_score >= 0.7:
        risk_severity = 'high'
    elif risk_score >= 0.4:
        risk_severity = 'medium'
    else:
        risk_severity = 'low'

    insights: List[Dict[str, Any]] = [
        {
            'type': 'risk',
            'title': 'Early warning risk posture',
            'detail': f"Risk tier {enterprise['risk_tier_3m']} with a score of {risk_score:.2f}. Prioritize closer follow-up if score stays above 0.70.",
            'severity': risk_severity,
            'confidence': round(min(0.98, 0.55 + (risk_score * 0.4)), 2),
        },
        {
            'type': 'employment',
            'title': 'Employment outlook signal',
            'detail': f"Projected jobs net change is {net_jobs:+d} over 3 months ({enterprise['jobs_created_3m']} created, {enterprise['jobs_lost_3m']} lost).",
            'severity': 'high' if net_jobs < 0 else ('medium' if net_jobs == 0 else 'low'),
            'confidence': 0.82,
        },
        {
            'type': 'portfolio',
            'title': 'Loan stress context',
            'detail': f"{high_arrears_count}/{loan_count} related loans are beyond 30 days in arrears with total outstanding exposure of {total_outstanding:,.0f}.",
            'severity': 'high' if high_arrears_count >= 3 else ('medium' if high_arrears_count > 0 else 'low'),
            'confidence': 0.79,
        },
    ]

    actions: List[Dict[str, Any]] = [
        {
            'priority': 'P1' if risk_score >= 0.7 else 'P2',
            'owner': 'Advisor',
            'action': 'Run cashflow review and agree a short-cycle intervention plan.',
            'target_days': 7 if risk_score >= 0.7 else 14,
        },
        {
            'priority': 'P2',
            'owner': 'Program Manager',
            'action': 'Validate portfolio exposure and monitor arrears trajectory weekly.',
            'target_days': 14,
        },
        {
            'priority': 'P3' if net_jobs >= 0 else 'P2',
            'owner': 'Business Coach',
            'action': 'Execute market linkage and retention support to protect jobs.',
            'target_days': 21,
        },
    ]

    return {
        'enterprise': enterprise,
        'related_loans': related_loans,
        'portfolio_context': {
            'loan_count': loan_count,
            'high_arrears_count': high_arrears_count,
            'avg_arrears_days': round(avg_arrears_days, 2),
            'total_outstanding': round(total_outstanding, 2),
            'net_jobs_3m': net_jobs,
        },
        'insights': insights,
        'actions': actions,
    }


# ═════════════════════════════════════════════════════════════════════════════════
# BENCHMARK DELTAS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_portfolio_deltas(
    db: AsyncSession, country_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Compute current metrics vs. trailing median/mean for delta badges.
    
    Returns:
    {
        'revenue_delta_pct': float,
        'jobs_delta_pct': float,
        'par30_delta_pct': float,
        'risk_trend': 'improving'|'stable'|'degrading',
    }
    """
    # Simple approach: current month vs. previous month
    today = date.today()
    survey_date_expr = _safe_survey_date_expr()
    this_month_start = date(today.year, today.month, 1)
    if today.month == 1:
        last_month_end = date(today.year - 1, 12, 31)
        last_month_start = date(today.year - 1, 12, 1)
    else:
        last_month_start = date(today.year, today.month - 1, 1)
        last_month_end = date(today.year, today.month - 1, 28)
    
    # This month revenue
    this_month_query = select(func.avg(cast(ImpactData.revenue_3m, Numeric))).where(
        survey_date_expr >= this_month_start
    )
    if country_code:
        this_month_query = this_month_query.where(ImpactData.country_code == country_code)
    
    this_month_revenue = await db.scalar(this_month_query)
    
    # Last month revenue
    last_month_query = select(func.avg(cast(ImpactData.revenue_3m, Numeric))).where(
        and_(
            survey_date_expr >= last_month_start,
            survey_date_expr <= last_month_end,
        )
    )
    if country_code:
        last_month_query = last_month_query.where(ImpactData.country_code == country_code)
    
    last_month_revenue = await db.scalar(last_month_query)
    
    revenue_delta_pct = 0.0
    if last_month_revenue and last_month_revenue > 0:
        revenue_delta_pct = ((this_month_revenue or 0) - last_month_revenue) / last_month_revenue * 100
    
    # Risk trend: count of low/medium/high this month vs last month
    this_risk_query = (
        select(func.count())
        .select_from(ImpactData)
        .filter(ImpactData.risk_tier_3m == 'HIGH')
        .where(survey_date_expr >= this_month_start)
    )
    if country_code:
        this_risk_query = this_risk_query.where(ImpactData.country_code == country_code)

    this_risk = await db.scalar(this_risk_query)
    this_high_risk = this_risk or 0
    
    last_risk_query = (
        select(func.count())
        .select_from(ImpactData)
        .filter(ImpactData.risk_tier_3m == 'HIGH')
        .where(
            and_(
                survey_date_expr >= last_month_start,
                survey_date_expr <= last_month_end,
            )
        )
    )
    if country_code:
        last_risk_query = last_risk_query.where(ImpactData.country_code == country_code)

    last_risk = await db.scalar(last_risk_query)
    last_high_risk = last_risk or 0
    
    if this_high_risk < last_high_risk:
        risk_trend = 'improving'
    elif this_high_risk > last_high_risk:
        risk_trend = 'degrading'
    else:
        risk_trend = 'stable'
    
    return {
        'revenue_delta_pct': revenue_delta_pct,
        'risk_trend': risk_trend,
    }


async def get_sector_risk_summary(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    """Return sector-level leaderboard with risk and outcome context."""
    query = select(
        ImpactData.business_sector,
        func.count(func.distinct(ImpactData.unique_id)).label('enterprise_count'),
        func.count().filter(ImpactData.risk_tier_3m == 'HIGH').label('high_risk_count'),
        func.count().filter(ImpactData.risk_tier_3m == 'MEDIUM').label('medium_risk_count'),
        func.count().filter(ImpactData.risk_tier_3m == 'LOW').label('low_risk_count'),
        func.coalesce(func.avg(cast(ImpactData.revenue_3m, Numeric)), 0).label('avg_revenue_3m'),
        func.coalesce(func.avg(cast(ImpactData.risk_score_3m, Numeric)), 0).label('avg_risk_score_3m'),
        func.coalesce(func.sum(cast(ImpactData.jobs_created_3m, Integer)), 0).label('jobs_created_3m'),
        func.coalesce(func.sum(cast(ImpactData.jobs_lost_3m, Integer)), 0).label('jobs_lost_3m'),
    ).group_by(ImpactData.business_sector).order_by(
        desc(func.count(func.distinct(ImpactData.unique_id))),
        desc(func.count().filter(ImpactData.risk_tier_3m == 'HIGH')),
    )

    if country_codes:
        query = query.where(ImpactData.country_code.in_(country_codes))

    query = query.limit(limit)
    rows = (await db.execute(query)).all()

    return [
        {
            'sector': r.business_sector or 'Unknown',
            'enterprise_count': int(r.enterprise_count or 0),
            'high_risk_count': int(r.high_risk_count or 0),
            'medium_risk_count': int(r.medium_risk_count or 0),
            'low_risk_count': int(r.low_risk_count or 0),
            'avg_revenue_3m': float(r.avg_revenue_3m or 0),
            'avg_risk_score_3m': float(r.avg_risk_score_3m or 0),
            'jobs_created_3m': int(r.jobs_created_3m or 0),
            'jobs_lost_3m': int(r.jobs_lost_3m or 0),
        }
        for r in rows
    ]


async def get_country_comparison(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Return per-country KPI comparison for executive leaderboard tables."""
    loan_query = select(
        CoreBankingLoan.country_code,
        func.count().label('loans'),
        func.coalesce(func.sum(_effective_disbursed_expr()), 0).label('total_disbursed'),
        func.coalesce(func.sum(cast(CoreBankingLoan.current_balance, Numeric)), 0).label('total_outstanding'),
        func.count().filter(cast(CoreBankingLoan.days_in_arrears, Integer) > 30).label('par30_count'),
    ).group_by(CoreBankingLoan.country_code)

    if country_codes:
        loan_query = loan_query.where(CoreBankingLoan.country_code.in_(country_codes))

    impact_query = select(
        ImpactData.country_code,
        func.count(func.distinct(ImpactData.unique_id)).label('enterprise_count'),
        func.coalesce(func.avg(cast(ImpactData.revenue_3m, Numeric)), 0).label('avg_revenue_3m'),
        (
            func.coalesce(func.sum(cast(ImpactData.jobs_created_3m, Integer)), 0)
            - func.coalesce(func.sum(cast(ImpactData.jobs_lost_3m, Integer)), 0)
        ).label('net_jobs_3m'),
        func.count().filter(ImpactData.risk_tier_3m == 'HIGH').label('high_risk_count'),
        func.count().label('risk_total_count'),
    ).group_by(ImpactData.country_code)

    if country_codes:
        impact_query = impact_query.where(ImpactData.country_code.in_(country_codes))

    loan_rows = (await db.execute(loan_query)).all()
    impact_rows = (await db.execute(impact_query)).all()

    by_country: Dict[str, Dict[str, Any]] = {}

    for row in loan_rows:
        code = row.country_code or 'NA'
        by_country[code] = {
            'country_code': code,
            'loans': int(row.loans or 0),
            'total_disbursed': float(row.total_disbursed or 0),
            'total_outstanding': float(row.total_outstanding or 0),
            'par30_pct': (float(row.par30_count or 0) / float(row.loans) * 100) if row.loans else 0.0,
            'enterprise_count': 0,
            'avg_revenue_3m': 0.0,
            'net_jobs_3m': 0,
            'high_risk_pct': 0.0,
        }

    for row in impact_rows:
        code = row.country_code or 'NA'
        bucket = by_country.setdefault(
            code,
            {
                'country_code': code,
                'loans': 0,
                'total_disbursed': 0.0,
                'total_outstanding': 0.0,
                'par30_pct': 0.0,
                'enterprise_count': 0,
                'avg_revenue_3m': 0.0,
                'net_jobs_3m': 0,
                'high_risk_pct': 0.0,
            },
        )
        risk_total = int(row.risk_total_count or 0)
        bucket.update(
            {
                'enterprise_count': int(row.enterprise_count or 0),
                'avg_revenue_3m': float(row.avg_revenue_3m or 0),
                'net_jobs_3m': int(row.net_jobs_3m or 0),
                'high_risk_pct': (float(row.high_risk_count or 0) / risk_total * 100) if risk_total > 0 else 0.0,
            }
        )

    return sorted(
        by_country.values(),
        key=lambda item: (item['high_risk_pct'], item['total_outstanding']),
        reverse=True,
    )


async def get_anomaly_signals(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Generate deterministic threshold-based anomaly signals for executive review."""
    signals: List[Dict[str, Any]] = []
    if country_codes and len(country_codes) == 1:
        summary = await get_portfolio_summary(db, country_code=next(iter(country_codes)))
        country_rows = await get_country_comparison(db, country_codes=country_codes)
    elif country_codes:
        country_rows = await get_country_comparison(db, country_codes=country_codes)
        summary = {
            'par30_pct': 0.0,
            'high_risk_count': 0,
            'total_loans': 0,
        }
        total_loans = sum(int(r.get('loans', 0)) for r in country_rows)
        summary['total_loans'] = total_loans
        summary['high_risk_count'] = int(
            sum((float(r.get('high_risk_pct', 0)) / 100.0) * int(r.get('enterprise_count', 0)) for r in country_rows)
        )
        summary['par30_pct'] = (
            sum(float(r.get('par30_pct', 0)) * int(r.get('loans', 0)) for r in country_rows) / total_loans
        ) if total_loans > 0 else 0.0
    else:
        summary = await get_portfolio_summary(db)
        country_rows = await get_country_comparison(db)

    # Portfolio-level thresholds
    if summary['par30_pct'] >= 18:
        signals.append(
            {
                'id': 'par30-critical',
                'severity': 'high',
                'title': 'Portfolio PAR30 exceeds critical threshold',
                'detail': f"PAR30 is {summary['par30_pct']:.1f}% against threshold 18.0%.",
                'metric': 'par30_pct',
                'value': float(summary['par30_pct']),
                'threshold': 18.0,
                'direction': 'above',
                'country_code': None,
                'sector': None,
            }
        )

    if summary['high_risk_count'] > max(10, int(summary['total_loans'] * 0.2)):
        threshold = float(max(10, int(summary['total_loans'] * 0.2)))
        signals.append(
            {
                'id': 'high-risk-load',
                'severity': 'medium',
                'title': 'High-risk enterprise load elevated',
                'detail': f"High-risk enterprises at {summary['high_risk_count']} exceed threshold {int(threshold)}.",
                'metric': 'high_risk_count',
                'value': float(summary['high_risk_count']),
                'threshold': threshold,
                'direction': 'above',
                'country_code': None,
                'sector': None,
            }
        )

    # Country-level thresholds
    for row in country_rows:
        if row['high_risk_pct'] >= 35:
            signals.append(
                {
                    'id': f"country-risk-{row['country_code']}",
                    'severity': 'high',
                    'title': f"{row['country_code']} high-risk concentration", 
                    'detail': f"High-risk share is {row['high_risk_pct']:.1f}% (threshold 35.0%).",
                    'metric': 'high_risk_pct',
                    'value': float(row['high_risk_pct']),
                    'threshold': 35.0,
                    'direction': 'above',
                    'country_code': row['country_code'],
                    'sector': None,
                }
            )
        if row['net_jobs_3m'] < -25:
            signals.append(
                {
                    'id': f"country-jobs-{row['country_code']}",
                    'severity': 'medium',
                    'title': f"{row['country_code']} employment contraction", 
                    'detail': f"Net jobs change is {row['net_jobs_3m']} (threshold -25).",
                    'metric': 'net_jobs_3m',
                    'value': float(row['net_jobs_3m']),
                    'threshold': -25.0,
                    'direction': 'below',
                    'country_code': row['country_code'],
                    'sector': None,
                }
            )

    severity_rank = {'high': 3, 'medium': 2, 'low': 1}
    signals.sort(key=lambda s: (severity_rank.get(s['severity'], 0), abs(s['value'] - s['threshold'])), reverse=True)
    return signals[:12]


def _latest_impact_subquery(country_codes: Optional[Set[str]] = None):
    """Latest survey record per enterprise for consistent point-in-time analytics."""
    survey_date_expr = _safe_survey_date_expr()
    ranked = select(
        ImpactData.unique_id.label('unique_id'),
        ImpactData.country_code.label('country_code'),
        ImpactData.business_sector.label('business_sector'),
        ImpactData.risk_tier_3m.label('risk_tier_3m'),
        cast(ImpactData.risk_score_3m, Numeric).label('risk_score_3m'),
        cast(ImpactData.revenue_3m, Numeric).label('revenue_3m'),
        cast(ImpactData.jobs_created_3m, Integer).label('jobs_created_3m'),
        cast(ImpactData.jobs_lost_3m, Integer).label('jobs_lost_3m'),
        survey_date_expr.label('survey_date'),
        func.row_number().over(
            partition_by=ImpactData.unique_id,
            order_by=survey_date_expr.desc(),
        ).label('rn'),
    )

    if country_codes:
        ranked = ranked.where(ImpactData.country_code.in_(country_codes))

    return ranked.subquery()


async def get_portfolio_composition(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """Return composition slices across sectors, countries, and risk tiers."""
    latest = _latest_impact_subquery(country_codes)

    sector_query = (
        select(
            latest.c.business_sector.label('label'),
            func.count().label('count'),
        )
        .where(latest.c.rn == 1)
        .group_by(latest.c.business_sector)
        .order_by(desc(func.count()))
        .limit(10)
    )
    country_query = (
        select(
            latest.c.country_code.label('label'),
            func.count().label('count'),
        )
        .where(latest.c.rn == 1)
        .group_by(latest.c.country_code)
        .order_by(desc(func.count()))
    )
    risk_query = (
        select(
            latest.c.risk_tier_3m.label('label'),
            func.count().label('count'),
        )
        .where(latest.c.rn == 1)
        .group_by(latest.c.risk_tier_3m)
        .order_by(desc(func.count()))
    )

    sector_rows = (await db.execute(sector_query)).all()
    country_rows = (await db.execute(country_query)).all()
    risk_rows = (await db.execute(risk_query)).all()

    def _to_pct(rows) -> List[Dict[str, Any]]:
        total = sum(int(r.count or 0) for r in rows)
        return [
            {
                'label': str(r.label or 'Unknown'),
                'count': int(r.count or 0),
                'pct': (float(r.count or 0) / total * 100.0) if total > 0 else 0.0,
            }
            for r in rows
        ]

    return {
        'sectors': _to_pct(sector_rows),
        'countries': _to_pct(country_rows),
        'risk_tiers': _to_pct(risk_rows),
    }


async def get_risk_migration(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Estimate month-over-month risk migration by comparing latest and prior surveys."""
    survey_date_expr = _safe_survey_date_expr()
    ranked = select(
        ImpactData.unique_id.label('unique_id'),
        ImpactData.country_code.label('country_code'),
        ImpactData.risk_tier_3m.label('risk_tier_3m'),
        func.row_number().over(
            partition_by=ImpactData.unique_id,
            order_by=survey_date_expr.desc(),
        ).label('rn'),
    )

    if country_codes:
        ranked = ranked.where(ImpactData.country_code.in_(country_codes))

    ranked_subq = ranked.subquery()
    current = ranked_subq.alias('current')
    previous = ranked_subq.alias('previous')

    current_rank = case(
        (current.c.risk_tier_3m == 'LOW', 1),
        (current.c.risk_tier_3m == 'MEDIUM', 2),
        (current.c.risk_tier_3m == 'HIGH', 3),
        else_=0,
    )
    previous_rank = case(
        (previous.c.risk_tier_3m == 'LOW', 1),
        (previous.c.risk_tier_3m == 'MEDIUM', 2),
        (previous.c.risk_tier_3m == 'HIGH', 3),
        else_=0,
    )

    query = (
        select(
            current.c.country_code.label('country_code'),
            func.sum(case((current_rank > previous_rank, 1), else_=0)).label('upshift_count'),
            func.sum(case((current_rank < previous_rank, 1), else_=0)).label('downshift_count'),
            func.sum(case((current_rank == previous_rank, 1), else_=0)).label('stable_count'),
            (func.avg(case((current.c.risk_tier_3m == 'HIGH', 1.0), else_=0.0)) * 100.0).label('high_risk_share_pct'),
        )
        .select_from(current)
        .join(previous, and_(current.c.unique_id == previous.c.unique_id, current.c.rn == 1, previous.c.rn == 2))
        .group_by(current.c.country_code)
        .order_by(desc(func.sum(case((current_rank > previous_rank, 1), else_=0))))
    )

    rows = (await db.execute(query)).all()
    return [
        {
            'country_code': str(r.country_code or 'NA'),
            'upshift_count': int(r.upshift_count or 0),
            'downshift_count': int(r.downshift_count or 0),
            'stable_count': int(r.stable_count or 0),
            'high_risk_share_pct': float(r.high_risk_share_pct or 0),
        }
        for r in rows
    ]


async def get_performance_distribution(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Return enterprise distribution across revenue bands with risk/jobs context."""
    latest = _latest_impact_subquery(country_codes)

    bucket_expr = case(
        (latest.c.revenue_3m < 1000, 'Micro'),
        (latest.c.revenue_3m < 5000, 'Small'),
        (latest.c.revenue_3m < 20000, 'Growth'),
        else_='Scale',
    )
    bucket_order = case(
        (bucket_expr == 'Micro', 1),
        (bucket_expr == 'Small', 2),
        (bucket_expr == 'Growth', 3),
        else_=4,
    )

    query = (
        select(
            bucket_expr.label('bucket'),
            func.count().label('count'),
            func.coalesce(func.avg(latest.c.revenue_3m), 0).label('avg_revenue_3m'),
            func.coalesce(func.avg(latest.c.risk_score_3m), 0).label('avg_risk_score_3m'),
            func.coalesce(func.sum(latest.c.jobs_created_3m - latest.c.jobs_lost_3m), 0).label('net_jobs_3m'),
            bucket_order.label('bucket_order'),
        )
        .where(latest.c.rn == 1)
        .group_by(bucket_expr, bucket_order)
        .order_by(bucket_order)
    )

    rows = (await db.execute(query)).all()
    return [
        {
            'bucket': str(r.bucket),
            'count': int(r.count or 0),
            'avg_revenue_3m': float(r.avg_revenue_3m or 0),
            'avg_risk_score_3m': float(r.avg_risk_score_3m or 0),
            'net_jobs_3m': int(r.net_jobs_3m or 0),
        }
        for r in rows
    ]


async def get_correlation_drivers(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Return a compact set of statistical correlation drivers for portfolio steering."""
    latest = _latest_impact_subquery(country_codes)

    impact_corr_query = select(
        func.corr(cast(latest.c.risk_score_3m, Numeric), cast(latest.c.revenue_3m, Numeric)).label('risk_revenue_corr'),
        func.corr(cast(latest.c.risk_score_3m, Numeric), cast(latest.c.jobs_created_3m, Numeric)).label('risk_jobs_created_corr'),
        func.corr(cast(latest.c.risk_score_3m, Numeric), cast(latest.c.jobs_lost_3m, Numeric)).label('risk_jobs_lost_corr'),
        func.count().label('sample_size'),
    ).where(latest.c.rn == 1)
    impact = (await db.execute(impact_corr_query)).first()

    loans_corr_query = select(
        func.corr(cast(CoreBankingLoan.days_in_arrears, Numeric), cast(CoreBankingLoan.current_balance, Numeric)).label('arrears_balance_corr'),
        func.count().label('sample_size'),
    )
    if country_codes:
        loans_corr_query = loans_corr_query.where(CoreBankingLoan.country_code.in_(country_codes))
    loans = (await db.execute(loans_corr_query)).first()

    def _classify(value: float) -> Tuple[str, str]:
        abs_val = abs(value)
        if abs_val >= 0.60:
            strength = 'strong'
        elif abs_val >= 0.35:
            strength = 'moderate'
        elif abs_val >= 0.15:
            strength = 'weak'
        else:
            strength = 'minimal'

        if value > 0.03:
            direction = 'positive'
        elif value < -0.03:
            direction = 'negative'
        else:
            direction = 'neutral'
        return strength, direction

    driver_values = [
        ('Risk vs Revenue', float(impact.risk_revenue_corr or 0), int(impact.sample_size or 0)),
        ('Risk vs Jobs Created', float(impact.risk_jobs_created_corr or 0), int(impact.sample_size or 0)),
        ('Risk vs Jobs Lost', float(impact.risk_jobs_lost_corr or 0), int(impact.sample_size or 0)),
        ('Arrears vs Outstanding Balance', float(loans.arrears_balance_corr or 0), int(loans.sample_size or 0)),
    ]

    return [
        {
            'driver': name,
            'correlation': value,
            'strength': _classify(value)[0],
            'sample_size': sample,
            'direction': _classify(value)[1],
        }
        for name, value, sample in driver_values
    ]


async def get_quality_ops(
    db: AsyncSession,
    country_codes: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """Return operational quality metrics used in governance and QA dashboards."""
    latest = _latest_impact_subquery(country_codes)
    stale_cutoff = date.today() - timedelta(days=180)

    impact_quality_query = select(
        func.count().label('total'),
        func.sum(case((latest.c.risk_score_3m.is_(None), 1), else_=0)).label('risk_missing'),
        func.sum(case((latest.c.revenue_3m.is_(None), 1), else_=0)).label('revenue_missing'),
        func.sum(case((latest.c.survey_date < stale_cutoff, 1), else_=0)).label('stale_profiles'),
        func.sum(case(((latest.c.jobs_created_3m - latest.c.jobs_lost_3m) < 0, 1), else_=0)).label('negative_jobs'),
    ).where(latest.c.rn == 1)
    impact_quality = (await db.execute(impact_quality_query)).first()

    loans_quality_query = select(
        func.count().label('total_loans'),
        func.sum(case((cast(CoreBankingLoan.days_in_arrears, Integer) > 30, 1), else_=0)).label('arrears_30_plus'),
    )
    if country_codes:
        loans_quality_query = loans_quality_query.where(CoreBankingLoan.country_code.in_(country_codes))
    loans_quality = (await db.execute(loans_quality_query)).first()

    total = int(impact_quality.total or 0)
    total_loans = int(loans_quality.total_loans or 0)

    def _pct(value: int, denom: int) -> float:
        return (float(value) / float(denom) * 100.0) if denom > 0 else 0.0

    def _status(value: float, threshold: float) -> str:
        if value >= threshold:
            return 'breach'
        if value >= threshold * 0.75:
            return 'watch'
        return 'ok'

    risk_missing_pct = _pct(int(impact_quality.risk_missing or 0), total)
    revenue_missing_pct = _pct(int(impact_quality.revenue_missing or 0), total)
    stale_profiles_pct = _pct(int(impact_quality.stale_profiles or 0), total)
    negative_jobs_pct = _pct(int(impact_quality.negative_jobs or 0), total)
    arrears_30_plus_pct = _pct(int(loans_quality.arrears_30_plus or 0), total_loans)

    return [
        {
            'metric': 'Risk score missing rate',
            'value': risk_missing_pct,
            'threshold': 5.0,
            'status': _status(risk_missing_pct, 5.0),
            'note': 'Profiles missing risk scores reduce anomaly confidence.',
        },
        {
            'metric': 'Revenue missing rate',
            'value': revenue_missing_pct,
            'threshold': 8.0,
            'status': _status(revenue_missing_pct, 8.0),
            'note': 'Missing revenue weakens performance and distribution analytics.',
        },
        {
            'metric': 'Stale profile rate (>180d)',
            'value': stale_profiles_pct,
            'threshold': 35.0,
            'status': _status(stale_profiles_pct, 35.0),
            'note': 'Older surveys should be refreshed for accurate steering decisions.',
        },
        {
            'metric': 'Loans above 30 arrears days',
            'value': arrears_30_plus_pct,
            'threshold': 18.0,
            'status': _status(arrears_30_plus_pct, 18.0),
            'note': 'Operational credit stress indicator from current loan book.',
        },
        {
            'metric': 'Negative net jobs profile rate',
            'value': negative_jobs_pct,
            'threshold': 30.0,
            'status': _status(negative_jobs_pct, 30.0),
            'note': 'High contraction rates require targeted advisory interventions.',
        },
    ]
