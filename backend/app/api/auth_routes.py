from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from app.db import engine
from app.auth.security import verify_password, create_access_token

router = APIRouter()

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/login")
def login(payload: LoginRequest):
    email = payload.email.lower()

    with engine.connect() as conn:
        user = conn.execute(
            text("""
                SELECT user_id, email, password_hash, is_active
                FROM auth_user
                WHERE email = :email
            """),
            {"email": email},
        ).mappings().first()

        if not user or not user["is_active"]:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        roles = conn.execute(
            text("""
                SELECT r.role_key
                FROM auth_user_role ur
                JOIN auth_role r ON r.role_id = ur.role_id
                WHERE ur.user_id = :uid
            """),
            {"uid": user["user_id"]},
        ).scalars().all()

    token = create_access_token({"sub": str(user["user_id"]), "roles": roles})
    return {"access_token": token, "token_type": "bearer", "roles": roles}
