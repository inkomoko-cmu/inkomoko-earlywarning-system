from datetime import datetime, timedelta
import os

from dotenv import load_dotenv
from jose import jwt
from passlib.context import CryptContext

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify plaintext password against stored hash."""
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict, expires_minutes: int = 60) -> str:
    """Create a JWT access token."""
    secret = os.getenv("JWT_SECRET", "dev-secret-change-me")
    algorithm = "HS256"

    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, secret, algorithm=algorithm)
