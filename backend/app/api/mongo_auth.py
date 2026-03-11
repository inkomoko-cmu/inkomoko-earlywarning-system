from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.collection import Collection
from jose import jwt, JWTError
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import os
import bcrypt
import logging
from bson import ObjectId

logger = logging.getLogger(__name__)

# MongoDB setup (adjust URI and DB name as needed)
client = AsyncIOMotorClient("mongodb+srv://Inkomoko:ymosyLynkAPr86EI@cluster0.2wssn.mongodb.net/?appName=Cluster0")
db = client["InkomokoDB"]  # Replace with your DB name
users_collection: Collection = db["users"]

# JWT settings (reuse or define separately)
SECRET_KEY = os.getenv("SECRET_KEY", "change_me_please")  # Use env var in production
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme_mongo = OAuth2PasswordBearer(tokenUrl="mongo/token")  # New token URL

class User(BaseModel):
    id: Optional[str] = None
    username: Optional[str] = None
    email: str
    role: Optional[str] = None
    roles: Optional[list] = None

    class Config:
        populate_by_name = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None

router = APIRouter(prefix="/mongo", tags=["mongo-auth"])  # New router prefix

def hash_password(plain_password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info(f"Login attempt for email: {form_data.username}")
    user = await users_collection.find_one({"email": form_data.username})
    
    if not user:
        logger.warning(f"User not found: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(form_data.password, user["password_hash"]):
        logger.warning(f"Password verification failed for: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Login successful for: {form_data.username}")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

async def get_current_user_mongo(token: str = Depends(oauth2_scheme_mongo)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(username=email)
    except JWTError:
        raise credentials_exception

    user = await users_collection.find_one({"email": token_data.username})
    if user is None:
        raise credentials_exception

    # Convert ObjectId to string and exclude hashed_password
    return User(
        id=str(user.get("_id", "")),
        username=user.get("username"),
        email=user.get("email"),
        role=user.get("role"),
        roles=user.get("roles"),
    )

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user_mongo)):
    return current_user