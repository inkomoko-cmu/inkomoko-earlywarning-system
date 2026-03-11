from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.crud.scope import get_user_scopes

from app.core.config import settings
from app.db.session import get_db
from app.crud.auth import get_user_by_email, get_user_roles
from motor.motor_asyncio import AsyncIOMotorClient
import os

bearer = HTTPBearer()

# MongoDB setup
mongo_client = AsyncIOMotorClient("mongodb+srv://Inkomoko:ymosyLynkAPr86EI@cluster0.2wssn.mongodb.net/?appName=Cluster0")
mongo_db = mongo_client["InkomokoDB"]
users_collection = mongo_db["users"]

MONGO_SECRET_KEY = os.getenv("SECRET_KEY", "change_me_please")

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    token = creds.credentials

    # 1) Try standard JWT first
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        email = payload.get("email")
        if email:
            user = await get_user_by_email(db, email=email)
            if user and user.is_active:
                roles = await get_user_roles(db, user.user_id)
                return user, roles
            # user not found or deactivated in PostgreSQL — fall through to MongoDB check
    except JWTError:
        pass  # Invalid/expired JWT — fall through to MongoDB token check
    except Exception:
        pass  # DB connection error — fall through to MongoDB token check

    # 2) Try MongoDB JWT
    try:
        payload = jwt.decode(token, MONGO_SECRET_KEY, algorithms=["HS256"])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Fetch user from MongoDB
        mongo_user = await users_collection.find_one({"email": email})
        if not mongo_user:
            raise HTTPException(status_code=401, detail="MongoDB user not found")

        # Map MongoDB role to app roles
        ROLE_MAP = {
            "admin": "Admin",
            "program_manager": "Program Manager",
            "advisor": "Advisor",
            "donor": "Donor",
        }

        # Fetch roles from the "roles" column in MongoDB users table
        raw_roles = mongo_user.get("roles", mongo_user.get("role", "donor"))

        # Handle both single role (string) and multiple roles (list)
        if isinstance(raw_roles, list):
            mapped_roles = [ROLE_MAP.get(r.lower(), r) for r in raw_roles]
        else:
            mapped_roles = [ROLE_MAP.get(raw_roles.lower(), raw_roles)]

        class MongoUser:
            def __init__(self, data):
                self.user_id = str(data.get("_id", email))
                self.email = data.get("email", email)
                self.is_active = True
                self.full_name = data.get("username", email)

        user = MongoUser(mongo_user)
        return user, mapped_roles

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_roles(*allowed: str):
    async def _guard(current=Depends(get_current_user)):
        user, roles = current
        if "admin" in roles:
            return user, roles
        if not any(r in roles for r in allowed):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user, roles
    return _guard


def _match_scope(scope_row, country_code, program_id, cohort_id) -> bool:
    if scope_row.country_code is not None and country_code is not None and scope_row.country_code != country_code:
        return False
    if scope_row.program_id is not None and program_id is not None and scope_row.program_id != program_id:
        return False
    if scope_row.cohort_id is not None and cohort_id is not None and scope_row.cohort_id != cohort_id:
        return False
    return True

def require_scope(country_code: str | None = None, program_id=None, cohort_id=None):
    async def _guard(current=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
        user, roles = current
        if "admin" in roles:
            return user, roles

        scopes = await get_user_scopes(db, user.user_id)
        if not scopes:
            raise HTTPException(status_code=403, detail="No scope assigned")

        ok = any(_match_scope(s, country_code, program_id, cohort_id) for s in scopes)
        if not ok:
            raise HTTPException(status_code=403, detail="Out of scope")
        return user, roles
    return _guard
