from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.rbac import router as rbac_router
from app.api.routes.data import router as data_router


from app.core.config import settings
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router

app = FastAPI(title="Inkomoko Intelligence Suite API")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rbac_router)
app.include_router(data_router)

@app.get("/health")
def health():
    return {"status": "ok"}
