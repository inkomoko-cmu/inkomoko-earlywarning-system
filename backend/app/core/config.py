from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql+asyncpg://inkomoko_app:StrongPass2026@localhost:5432/inkomoko_early_warning"
    )
    JWT_SECRET: str = "dev_secret_change_in_production"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MIN: int = 60
    CORS_ORIGINS: str = "http://localhost:3000"
    DEBUG_MODE: bool = True  # Set False in production
    LLM_ENABLED: bool = False
    LLM_BASE_URL: str = "http://127.0.0.1:11434"
    LLM_MODEL: str = "qwen2.5:7b-instruct"
    LLM_TIMEOUT_SECONDS: int = 25
    AI_INSIGHTS_TTL_SECONDS: int = 1800
    AI_PROMPT_VERSION: str = "v1"
    AI_WORKER_IDLE_SECONDS: int = 3
    AI_WORKER_BUSY_PAUSE_SECONDS: int = 0

    class Config:
        env_file = ".env"


settings = Settings()
