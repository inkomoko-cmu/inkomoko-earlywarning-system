"""Business read models for curated anonymized portfolio data."""

from datetime import date
from decimal import Decimal
from sqlalchemy import Date, Numeric, String, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models.auth import Base


class CoreBankingLoan(Base):
    """Loan-level curated anonymized view."""

    __tablename__ = "vw_anon_investment_curated"

    loan_number: Mapped[str] = mapped_column("loan_number", String(100), primary_key=True)
    client_id: Mapped[str] = mapped_column("client_id", String(100), primary_key=True)

    country_code: Mapped[str] = mapped_column("country_code", String(2), nullable=False, index=True)
    disbursement_date: Mapped[date | None] = mapped_column("disbursement_date", Date)
    applied_amount: Mapped[Decimal] = mapped_column("applied_amount", Numeric(18, 2))
    approved_amount: Mapped[Decimal] = mapped_column("approved_amount", Numeric(18, 2))
    disbursed_amount: Mapped[Decimal] = mapped_column("disbursed_amount", Numeric(18, 2))
    current_balance: Mapped[Decimal] = mapped_column("current_balance", Numeric(18, 2))

    days_in_arrears: Mapped[int] = mapped_column("days_in_arrears", Integer, nullable=False, index=True)
    installment_in_arrears: Mapped[int] = mapped_column("installment_in_arrears", Integer)

    loan_status: Mapped[str] = mapped_column("loan_status", String(50), nullable=False, index=True)

    industry_sector: Mapped[str] = mapped_column("industry_sector", String(100))


class ImpactData(Base):
    """Enterprise impact view derived from anonymized baseline/endline/investment."""

    __tablename__ = "vw_anon_impact_curated"

    unique_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(100), nullable=False)
    survey_date: Mapped[date | None] = mapped_column(Date, index=True)

    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    client_location: Mapped[str | None] = mapped_column(String(100))
    nationality: Mapped[str | None] = mapped_column(String(100))
    education_level: Mapped[str | None] = mapped_column(String(50))
    strata: Mapped[str | None] = mapped_column(String(50))

    business_sector: Mapped[str] = mapped_column(String(100))
    business_sub_sector: Mapped[str | None] = mapped_column(String(100))

    revenue: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    jobs_created_3m: Mapped[int] = mapped_column(Integer)
    jobs_lost_3m: Mapped[int] = mapped_column(Integer)
    revenue_3m: Mapped[Decimal] = mapped_column(Numeric(18, 2))

    risk_tier_3m: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    risk_score_3m: Mapped[Decimal] = mapped_column(Numeric(6, 6))

    nps_detractor: Mapped[Boolean] = mapped_column(Boolean)
    nps_promoter: Mapped[Boolean] = mapped_column(Boolean)
    satisfied_yes: Mapped[Boolean] = mapped_column(Boolean)
    satisfied_no: Mapped[Boolean] = mapped_column(Boolean)
