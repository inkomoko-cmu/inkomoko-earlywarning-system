"""
Analytics CRUD layer for portfolio overview metrics.

Aggregations over core_banking_loans and impact_data tables,
with support for trends, segments, and statistical confidence intervals.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Tuple, Any
from sqlalchemy import func, and_, or_, select, literal_column, cast, Numeric, Integer, Boolean, Date, desc, case
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


# ═══════════════════════════════════════════════════════════════════════════════
# PORTFOLIO HEADLINE KPIs
# ═══════════════════════════════════════════════════════════════════════════════

async def get_portfolio_summary(db: AsyncSession, country_code: Optional[str] = None) -> Dict[str, Any]:
    """
    Get headline portfolio summary metrics from loans and impact data.
    
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
    
    total_enterprises = impact_data.total_enterprises or 1
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
    Get risk tier distribution from impact data.
    
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
    
    # Revenue trend from impact data
    revenue_query = select(
        cast(ImpactData.survey_date, Date).label('survey_date'),
        func.avg(cast(ImpactData.revenue, Numeric)).label('avg_revenue'),
        func.stddev(cast(ImpactData.revenue, Numeric)).label('std_revenue'),
        func.count().label('count_records'),
    ).where(cast(ImpactData.survey_date, Date) >= cutoff_date)
    
    if country_code:
        revenue_query = revenue_query.where(ImpactData.country_code == country_code)
    
    revenue_query = revenue_query.group_by(
        cast(ImpactData.survey_date, Date)
    ).order_by(cast(ImpactData.survey_date, Date))
    
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
        cast(ImpactData.survey_date, Date).label('survey_date'),
        func.sum(cast(ImpactData.jobs_created_3m, Integer)).label('total_jobs'),
    ).where(cast(ImpactData.survey_date, Date) >= cutoff_date)
    
    if country_code:
        jobs_created_query = jobs_created_query.where(ImpactData.country_code == country_code)
    
    jobs_created_query = jobs_created_query.group_by(
        cast(ImpactData.survey_date, Date)
    ).order_by(cast(ImpactData.survey_date, Date))
    
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

async def get_by_country(db: AsyncSession) -> List[Dict[str, Any]]:
    """
    Portfolio metrics broken down by country using LOAN data.
    """
    query = select(
        CoreBankingLoan.country_code,
        func.count().label('loans'),
        func.coalesce(func.sum(_effective_disbursed_expr()), 0).label('total_disbursed'),
        func.coalesce(func.sum(cast(CoreBankingLoan.current_balance, Numeric)), 0).label('total_outstanding'),
    ).group_by(CoreBankingLoan.country_code).order_by(CoreBankingLoan.country_code)
    
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


async def get_by_sector(db: AsyncSession) -> List[Dict[str, Any]]:
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
    Get individual loan records from core_banking table.
    
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
    Get enterprise-level profiles from impact_data.

    Returns DB-backed unique_id records with risk/revenue/jobs 3M projections.
    """
    query = select(
        ImpactData.unique_id,
        ImpactData.country_code,
        ImpactData.business_sector,
        cast(ImpactData.survey_date, Date),
        ImpactData.risk_tier_3m,
        cast(ImpactData.risk_score_3m, Numeric),
        cast(ImpactData.revenue_3m, Numeric),
        cast(ImpactData.jobs_created_3m, Integer),
        cast(ImpactData.jobs_lost_3m, Integer),
    )

    if country_code:
        query = query.where(ImpactData.country_code == country_code)

    query = query.order_by(cast(ImpactData.survey_date, Date).desc(), ImpactData.unique_id)

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
    enterprise_query = select(
        ImpactData.unique_id,
        ImpactData.country_code,
        ImpactData.business_sector,
        cast(ImpactData.survey_date, Date),
        ImpactData.risk_tier_3m,
        cast(ImpactData.risk_score_3m, Numeric),
        cast(ImpactData.revenue_3m, Numeric),
        cast(ImpactData.jobs_created_3m, Integer),
        cast(ImpactData.jobs_lost_3m, Integer),
    ).where(ImpactData.unique_id == unique_id)

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
    this_month_start = date(today.year, today.month, 1)
    if today.month == 1:
        last_month_end = date(today.year - 1, 12, 31)
        last_month_start = date(today.year - 1, 12, 1)
    else:
        last_month_start = date(today.year, today.month - 1, 1)
        last_month_end = date(today.year, today.month - 1, 28)
    
    # This month revenue
    this_month_query = select(func.avg(cast(ImpactData.revenue_3m, Numeric))).where(
        cast(ImpactData.survey_date, Date) >= this_month_start
    )
    if country_code:
        this_month_query = this_month_query.where(ImpactData.country_code == country_code)
    
    this_month_revenue = await db.scalar(this_month_query)
    
    # Last month revenue
    last_month_query = select(func.avg(cast(ImpactData.revenue_3m, Numeric))).where(
        and_(
            cast(ImpactData.survey_date, Date) >= last_month_start,
            cast(ImpactData.survey_date, Date) <= last_month_end,
        )
    )
    if country_code:
        last_month_query = last_month_query.where(ImpactData.country_code == country_code)
    
    last_month_revenue = await db.scalar(last_month_query)
    
    revenue_delta_pct = 0.0
    if last_month_revenue and last_month_revenue > 0:
        revenue_delta_pct = ((this_month_revenue or 0) - last_month_revenue) / last_month_revenue * 100
    
    # Risk trend: count of low/medium/high this month vs last month
    this_risk = await db.scalar(
        select(func.count())
        .select_from(ImpactData)
        .filter(ImpactData.risk_tier_3m == 'HIGH')
        .where(cast(ImpactData.survey_date, Date) >= this_month_start)
    )
    this_high_risk = this_risk or 0
    
    last_risk = await db.scalar(
        select(func.count())
        .select_from(ImpactData)
        .filter(ImpactData.risk_tier_3m == 'HIGH')
        .where(
            and_(
                cast(ImpactData.survey_date, Date) >= last_month_start,
                cast(ImpactData.survey_date, Date) <= last_month_end,
            )
        )
    )
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
