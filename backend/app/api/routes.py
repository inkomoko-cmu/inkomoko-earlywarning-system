# from fastapi import APIRouter

# router = APIRouter(prefix="/api")

# @router.get("/users")
# def list_users():
#     return [{"id": 1, "name": "Samuel"}]


from fastapi import APIRouter
from app.api.users import router as users_router
from app.api.auth_routes import router as auth_router
from app.api.health import router as health_router

router = APIRouter(prefix="/api")

router.include_router(users_router, tags=["users"])
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(health_router, tags=["health"])
