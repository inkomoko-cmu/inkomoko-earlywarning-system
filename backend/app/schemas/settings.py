from pydantic import BaseModel, Field


class RiskTierThreshold(BaseModel):
    score_min: float = Field(ge=0, le=100)
    score_max: float = Field(ge=0, le=100)
    arrears_days: int = Field(ge=0)
    revenue_decline_pct: float = Field(ge=0, le=100)
    jobs_lost_pct: float = Field(ge=0, le=100)


class RiskThresholdsConfig(BaseModel):
    low: RiskTierThreshold
    medium: RiskTierThreshold
    high: RiskTierThreshold
    high_if_any_triggered: bool = True


class HorizonConfig(BaseModel):
    enabled: bool = True
    confidence_interval: int = Field(default=95, ge=80, le=99)
    min_confidence_pct: float = Field(default=70, ge=0, le=100)


class PredictionHorizonsConfig(BaseModel):
    one_month: HorizonConfig
    two_month: HorizonConfig
    three_month: HorizonConfig
    recompute_frequency: str = Field(default="daily")


class RetrainingConfig(BaseModel):
    enabled: bool = True
    frequency: str = Field(default="monthly")
    run_time_utc: str = Field(default="02:00")
    training_window_months: int = Field(default=24, ge=3, le=60)
    auto_deploy: bool = False
    min_improvement_pct: float = Field(default=2.0, ge=0, le=100)


class ImportJobConfig(BaseModel):
    enabled: bool = True
    frequency: str = Field(default="daily")
    run_time_utc: str = Field(default="01:00")
    max_retries: int = Field(default=3, ge=0, le=10)


class CronJobsConfig(BaseModel):
    loan_import: ImportJobConfig
    impact_import: ImportJobConfig
    retraining_job: ImportJobConfig


class AlertRulesConfig(BaseModel):
    high_risk_enabled: bool = True
    high_risk_threshold_count: int = Field(default=10, ge=1)
    par30_enabled: bool = True
    par30_threshold_pct: float = Field(default=20, ge=0, le=100)
    import_failure_enabled: bool = True
    delivery_channel: str = Field(default="in_app")
    recipient_email: str | None = None


class SettingsResponse(BaseModel):
    risk_thresholds: RiskThresholdsConfig
    prediction_horizons: PredictionHorizonsConfig
    retraining: RetrainingConfig
    cron_jobs: CronJobsConfig
    alert_rules: AlertRulesConfig
    updated_at: str | None = None


class SettingsUpdateRequest(BaseModel):
    risk_thresholds: RiskThresholdsConfig | None = None
    prediction_horizons: PredictionHorizonsConfig | None = None
    retraining: RetrainingConfig | None = None
    cron_jobs: CronJobsConfig | None = None
    alert_rules: AlertRulesConfig | None = None
