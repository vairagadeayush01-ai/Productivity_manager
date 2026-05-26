"""
core/security.py — JWT access tokens + refresh token utilities.

Access tokens:
  - Short-lived: 15 minutes (changed from 7 days)
  - HS256 signed JWT
  - Payload: {sub: user_id, email, exp}

Refresh tokens:
  - Long-lived: 7 days
  - Opaque random string (32 bytes hex)
  - Stored as bcrypt hash in refresh_tokens table
  - Rotation: each use issues a new refresh token, old one revoked

Password hashing:
  - bcrypt cost=12
  - Timing-attack resistant via passlib
"""
import os
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production-use-long-random-string")
ALGORITHM = "HS256"

# Access token: short-lived (15 min). Extension refresh handles rotation.
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))

# Refresh token: 7 days
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── Access token ─────────────────────────────────────────────────────────────

def create_access_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "email": email, "exp": expire, "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Reject refresh tokens accidentally used as access tokens
        if payload.get("type") not in ("access", None):
            return None
        return payload
    except JWTError:
        return None


# ─── Refresh token ────────────────────────────────────────────────────────────

def generate_refresh_token() -> str:
    """Generate a cryptographically secure opaque refresh token string."""
    return secrets.token_hex(32)  # 64-char hex string


def hash_refresh_token(token: str) -> str:
    """Hash the opaque refresh token for safe DB storage."""
    return pwd_context.hash(token)


def verify_refresh_token(plain: str, hashed: str) -> bool:
    """Verify a plain refresh token against its stored hash."""
    return pwd_context.verify(plain, hashed)


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
