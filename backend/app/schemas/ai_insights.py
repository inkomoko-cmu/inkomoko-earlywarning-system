from pydantic import BaseModel, Field


class AiInsightCard(BaseModel):
    id: str
    title: str
    narrative: str
    confidence: int = Field(ge=0, le=100)
    tone: str = Field(pattern="^(success|warning|danger|neutral)$")
    evidence: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)


class AiInsightsRefreshRequest(BaseModel):
    scope_type: str
    scope_id: str | None = None
    context: dict = Field(default_factory=dict)
    force_refresh: bool = False


class AiInsightsRefreshResponse(BaseModel):
    status: str
    stale: bool
    job_id: str | None = None
    generated_at: str | None = None
    insights: list[AiInsightCard] = Field(default_factory=list)


class AiInsightsGetResponse(BaseModel):
    status: str
    stale: bool
    generated_at: str | None = None
    insights: list[AiInsightCard] = Field(default_factory=list)


class AiInsightJobStatusResponse(BaseModel):
    job_id: str
    status: str
    attempts: int
    error_message: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
