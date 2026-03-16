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
