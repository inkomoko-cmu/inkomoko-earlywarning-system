"""
API response schemas for portfolio overview endpoints.
"""

from typing import List, Optional
from pydantic import BaseModel


class RiskDistributionItem(BaseModel):
    """Risk tier distribution entry."""
    name: str
    value: int
    pct: float


class TrendPoint(BaseModel):
    """A single point in a time series trend."""
    month: str
    value: float
    upper_ci: float
    lower_ci: float
    n: Optional[int] = None


class TrendsResponse(BaseModel):
    """Time series trends for revenue and employment."""
    revenue: List[TrendPoint]
    jobs_created: List[TrendPoint]


class SegmentItem(BaseModel):
    """Segment breakdown (country or sector)."""
    country_code: Optional[str] = None
    sector: Optional[str] = None
    client_count: int
    total_revenue: float
    avg_revenue: float
    jobs_created: int
    jobs_lost: int
    high_risk_count: int


class CountryLoanItem(BaseModel):
    """Loan portfolio breakdown by country."""
    country_code: str
    loans: int
    total_disbursed: float
    total_outstanding: float


class SectorRiskSummaryItem(BaseModel):
    """Sector leaderboard with risk and impact context."""
    sector: str
    enterprise_count: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    avg_revenue_3m: float
    avg_risk_score_3m: float
    jobs_created_3m: int
    jobs_lost_3m: int


class CountryComparisonItem(BaseModel):
    """Cross-country KPI comparison for executive benchmarking."""
    country_code: str
    loans: int
    enterprise_count: int
    total_outstanding: float
    total_disbursed: float
    par30_pct: float
    avg_revenue_3m: float
    net_jobs_3m: int
    high_risk_pct: float


class AnomalySignalItem(BaseModel):
    """Threshold-based anomaly signal for decision support."""
    id: str
    severity: str
    title: str
    detail: str
    metric: str
    value: float
    threshold: float
    direction: str
    country_code: Optional[str] = None
    sector: Optional[str] = None


class CompositionSliceItem(BaseModel):
    """Single composition slice for a given dimension."""
    label: str
    count: int
    pct: float


class PortfolioCompositionResponse(BaseModel):
    """Portfolio composition across sector, country, and risk tiers."""
    sectors: List[CompositionSliceItem]
    countries: List[CompositionSliceItem]
    risk_tiers: List[CompositionSliceItem]


class RiskMigrationItem(BaseModel):
    """Month-over-month risk movement by country."""
    country_code: str
    upshift_count: int
    downshift_count: int
    stable_count: int
    high_risk_share_pct: float


class PerformanceDistributionItem(BaseModel):
    """Revenue-bucket distribution with jobs and risk context."""
    bucket: str
    count: int
    avg_revenue_3m: float
    avg_risk_score_3m: float
    net_jobs_3m: int


class CorrelationDriverItem(BaseModel):
    """Correlation metric used to explain risk/performance drivers."""
    driver: str
    correlation: float
    strength: str
    sample_size: int
    direction: str


class QualityOpsItem(BaseModel):
    """Operational quality metric for dashboard governance."""
    metric: str
    value: float
    threshold: float
    status: str
    note: str


class EnterpriseProfileItem(BaseModel):
    """Enterprise-level prediction snapshot from curated anonymized views."""
    unique_id: str
    country_code: Optional[str] = None
    country_specific: Optional[str] = None
    business_sector: Optional[str] = None
    business_sub_sector: Optional[str] = None
    survey_date: Optional[str] = None
    risk_tier_3m: Optional[str] = None
    risk_score_3m: float
    revenue_3m: float
    jobs_created_3m: int
    jobs_lost_3m: int
    plan_after_program: Optional[str] = None


class EnterpriseLoanItem(BaseModel):
    """Loan records related to an enterprise context."""
    loannumber: str
    country_code: str
    industrysectorofactivity: Optional[str] = None
    loanstatus: Optional[str] = None
    disbursedamount: float
    currentbalance: float
    daysinarrears: int
    installmentinarrears: int


class EnterpriseInsightItem(BaseModel):
    """Structured AI-style insight generated from profile metrics."""
    type: str
    title: str
    detail: str
    severity: str
    confidence: float


class EnterpriseActionItem(BaseModel):
    """Recommended action plan item for advisors."""
    priority: str
    owner: str
    action: str
    target_days: int


class EnterpriseDetailResponse(BaseModel):
    """Full enterprise profile detail response."""
    enterprise: EnterpriseProfileItem
    related_loans: List[EnterpriseLoanItem]
    portfolio_context: dict
    insights: List[EnterpriseInsightItem]
    actions: List[EnterpriseActionItem]


class SegmentResponse(BaseModel):
    """Segment breakdown response."""
    segments: List[SegmentItem]


class ScorecardPillar(BaseModel):
    """Single pillar on balanced scorecard."""
    pillar: str
    score: float


class ScorecardResponse(BaseModel):
    """Donor-facing balanced scorecard."""
    pillars: List[ScorecardPillar]


class PortfolioDelta(BaseModel):
    """Change indicators for KPI badges."""
    revenue_delta_pct: float
    risk_trend: str  # 'improving' | 'stable' | 'degrading'


class PortfolioOverviewResponse(BaseModel):
    """
    Main portfolio overview endpoint response.
    Contains headline KPIs, distributions, and deltas.
    """
    # Loan metrics
    total_loans: int
    total_disbursed: float
    total_outstanding: float
    avg_days_in_arrears: float
    par30_pct: float
    par30_amount: float
    defaulted_count: int
    closed_count: int
    active_count: int
    
    # Impact metrics
    avg_revenue_3m: float
    total_jobs_created_3m: int
    total_jobs_lost_3m: int
    nps_promoter_pct: float
    nps_detractor_pct: float
    
    # Risk
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    
    # Deltas for badges
    revenue_delta_pct: float
    risk_trend: str
