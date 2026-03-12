from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:password@localhost:5432/inkomoko_early_warning"
    )
    JWT_SECRET: str = "dev_secret_change_in_production"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MIN: int = 60
    CORS_ORIGINS: str = "http://localhost:3000"
    DEBUG_MODE: bool = True  # Set False in production

    class Config:
        env_file = ".env"


settings = Settings()
