"""
Business domain models for loans and impact metrics.

These ORM models map to the core_banking_loans and impact_data tables
that are loaded from CSV snapshots in ml/synthetic_outputs/.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Date, DateTime, Numeric, String, Text, Integer, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.auth import Base


class CoreBankingLoan(Base):
    """
    Core banking loan fact table.
    Loaded from ml/synthetic_outputs/core_banking_loans.csv
    
    Represents loan-level details: amounts, status, arrears, payments.
    """
    __tablename__ = "core_banking"

    # Loan identifiers & linking
    loan_number: Mapped[str] = mapped_column("loan_number", String(100), primary_key=True)
    client_id: Mapped[str] = mapped_column("client_id", String(100), nullable=False)
    
    # Metadata
    country_code: Mapped[str] = mapped_column("country_code", String(2), nullable=False, index=True)
    country: Mapped[str] = mapped_column("country", String(100))
    purpose: Mapped[str] = mapped_column("purpose", String(100))
    strata: Mapped[str] = mapped_column("strata", String(50))  # host/refugee
    
    # Dates
    submission_date: Mapped[date] = mapped_column("submission_date", Date)
    approval_date: Mapped[date] = mapped_column("approval_date", Date)
    disbursement_date: Mapped[date] = mapped_column("disbursement_date", Date, nullable=False, index=True)
    last_payment_date: Mapped[date] = mapped_column("last_payment_date", Date)
    
    # Amounts (in local/base currency)
    applied_amount: Mapped[Decimal] = mapped_column("applied_amount", Numeric(18, 2))
    approved_amount: Mapped[Decimal] = mapped_column("approved_amount", Numeric(18, 2))
    disbursed_amount: Mapped[Decimal] = mapped_column("disbursed_amount", Numeric(18, 2), nullable=False)
    
    # Balance tracking
    current_balance: Mapped[Decimal] = mapped_column("current_balance", Numeric(18, 2))
    principal_balance: Mapped[Decimal] = mapped_column("principal_balance", Numeric(18, 2))
    interest_balance: Mapped[Decimal] = mapped_column("interest_balance", Numeric(18, 2))
    fees_balance: Mapped[Decimal] = mapped_column("fees_balance", Numeric(18, 2))
    
    # Payment history
    actual_payment_amount: Mapped[Decimal] = mapped_column("actual_payment_amount", Numeric(18, 2))
    principal_paid: Mapped[Decimal] = mapped_column("principal_paid", Numeric(18, 2))
    interest_paid: Mapped[Decimal] = mapped_column("interest_paid", Numeric(18, 2))
    insurance_fee_paid: Mapped[Decimal] = mapped_column("insurance_fee_paid", Numeric(18, 2))
    total_late_fees_paid: Mapped[Decimal] = mapped_column("total_late_fees_paid", Numeric(18, 2))
    last_payment_amount: Mapped[Decimal] = mapped_column("last_payment_amount", Numeric(18, 2))
    
    # Arrears & risk
    days_in_arrears: Mapped[int] = mapped_column("days_in_arrears", Integer, nullable=False, index=True)
    amount_past_due: Mapped[Decimal] = mapped_column("amount_past_due", Numeric(18, 2))
    principal_past_due: Mapped[Decimal] = mapped_column("principal_past_due", Numeric(18, 2))
    interest_past_due: Mapped[Decimal] = mapped_column("interest_past_due", Numeric(18, 2))
    fees_past_due: Mapped[Decimal] = mapped_column("fees_past_due", Numeric(18, 2))
    installment_in_arrears: Mapped[int] = mapped_column("installment_in_arrears", Integer)
    
    # Terms
    loan_type: Mapped[str] = mapped_column("loan_type", String(50))
    terms_duration: Mapped[int] = mapped_column("terms_duration", Integer)  # months
    
    # Status
    loan_status: Mapped[str] = mapped_column("loan_status", String(50), nullable=False, index=True)
    interest_waived: Mapped[Decimal] = mapped_column("interest_waived", Numeric(18, 2))
    
    # Enterprise context
    industry_sector: Mapped[str] = mapped_column("industry_sector_of_activity", String(100))
    business_sub_sector: Mapped[str] = mapped_column("business_sub_sector", String(100))

    __table_args__ = (
        Index("idx_cbl_client_country", "client_id", "country_code"),
        Index("idx_cbl_status_date", "loan_status", "disbursement_date"),
        Index("idx_cbl_arrears", "days_in_arrears"),
    )


class ImpactData(Base):
    """
    Impact survey & KPI tracking table.
    Loaded from ml/synthetic_outputs/impact_data.csv
    
    Represents enterprise-level survey responses and computed KPI metrics
    across 1m/2m/3m horizons for risk, employment, and revenue.
    """
    __tablename__ = "impact_data"

    # Primary key
    # Identifiers & linking
    unique_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(100))
    survey_id: Mapped[str] = mapped_column(String(100))
    survey_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    
    # Geography & context
    country_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    country_specific: Mapped[str] = mapped_column(String(100))
    client_location: Mapped[str] = mapped_column(String(100))
    strata: Mapped[str] = mapped_column(String(50))  # host/refugee
    
    # Demographics
    age: Mapped[int] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(String(20))
    education_level: Mapped[str] = mapped_column(String(50))
    
    # Enterprise details
    business_sector: Mapped[str] = mapped_column(String(100))
    business_sub_sector: Mapped[str] = mapped_column(String(100))
    business_location: Mapped[str] = mapped_column(String(100))
    is_business_registered: Mapped[Boolean] = mapped_column(Boolean)
    
    # Business activity
    only_income_earner: Mapped[Boolean] = mapped_column(Boolean)
    has_started_business: Mapped[Boolean] = mapped_column(Boolean)
    number_of_people_responsible: Mapped[int] = mapped_column(Integer)
    
    # Financial access & practices
    have_bank_account: Mapped[Boolean] = mapped_column(Boolean)
    has_access_to_finance_past_6m: Mapped[Boolean] = mapped_column(Boolean)
    kept_sales_record: Mapped[Boolean] = mapped_column(Boolean)
    monthly_customer: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    
    # Business improvements
    bz_have_new_practices: Mapped[Boolean] = mapped_column(Boolean)
    practice_type: Mapped[str] = mapped_column(String(100))
    bz_have_new_product: Mapped[Boolean] = mapped_column(Boolean)
    new_product_type: Mapped[str] = mapped_column(String(100))
    
    # Training & support
    did_you_attended_all_training: Mapped[Boolean] = mapped_column(Boolean)
    does_training_increased_bz_skills: Mapped[Boolean] = mapped_column(Boolean)
    
    # Business challenges & aspirations
    business_challenges: Mapped[str] = mapped_column(Text)
    plan_after_program: Mapped[str] = mapped_column(String(100))
    
    # Current financials (survey period)
    revenue: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    hh_expense: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    
    # Employment metrics (1m/2m/3m)
    jobs_created_1m: Mapped[int] = mapped_column(Integer)
    jobs_created_2m: Mapped[int] = mapped_column(Integer)
    jobs_created_3m: Mapped[int] = mapped_column(Integer)
    jobs_lost_1m: Mapped[int] = mapped_column(Integer)
    jobs_lost_2m: Mapped[int] = mapped_column(Integer)
    jobs_lost_3m: Mapped[int] = mapped_column(Integer)
    job_created: Mapped[int] = mapped_column(Integer)  # survey response summary
    
    # Revenue forecasts (1m/2m/3m)
    revenue_1m: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    revenue_2m: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    revenue_3m: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    
    # Risk tiers (1m/2m/3m)
    risk_tier_1m: Mapped[str] = mapped_column(String(20))  # LOW/MEDIUM/HIGH
    risk_tier_2m: Mapped[str] = mapped_column(String(20))
    risk_tier_3m: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    
    # Risk scores (0..1 scale)
    risk_score_1m: Mapped[Decimal] = mapped_column(Numeric(6, 6))
    risk_score_2m: Mapped[Decimal] = mapped_column(Numeric(6, 6))
    risk_score_3m: Mapped[Decimal] = mapped_column(Numeric(6, 6))
    
    # NPS & satisfaction
    nps_detractor: Mapped[Boolean] = mapped_column(Boolean)
    nps_passive: Mapped[Boolean] = mapped_column(Boolean)
    nps_promoter: Mapped[Boolean] = mapped_column(Boolean)
    satisfied_yes: Mapped[Boolean] = mapped_column(Boolean)
    satisfied_no: Mapped[Boolean] = mapped_column(Boolean)
    
    # Survey type
    survey_name: Mapped[str] = mapped_column(String(100))
    
    # Capital & assets
    bz_source_capital: Mapped[str] = mapped_column(String(100))
    did_you_buy_assets_past_6m: Mapped[Boolean] = mapped_column(Boolean)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_impact_survey_date", "survey_date"),
        Index("idx_impact_country_date", "country_code", "survey_date"),
        Index("idx_impact_risk_tier", "risk_tier_3m"),
        Index("idx_impact_sector", "business_sector"),
    )
