"""
routes/auth.py — Authentication endpoints with refresh token rotation.

Token lifecycle:
  POST /auth/login    → {access_token (15min), refresh_token (7days), user}
  POST /auth/refresh  → validates refresh token, issues NEW pair, revokes old token
  POST /auth/logout   → revokes the refresh token
  GET  /auth/me       → returns current user from access token

Refresh token security:
  - Stored as bcrypt hash in refresh_tokens table
  - Each use rotates both tokens (new access + new refresh)
  - Old refresh token is immediately revoked after rotation
  - Expired or revoked tokens return 401

The extension uses POST /auth/refresh when it gets a 401 on the sync endpoint.
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
    verify_refresh_token,
)
from database import (
    DailyDiary,
    LearningEntry,
    QuizResult,
    RefreshToken,
    Streak,
    TopicReview,
    User,
    get_db,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class LogoutRequest(BaseModel):
    refresh_token: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _issue_tokens(db: Session, user: User, device_info: Optional[str] = None) -> dict:
    """
    Create a new access + refresh token pair.
    Persists the refresh token hash to the DB.
    Returns the plain (unhashed) refresh token — only time it's available.
    """
    access_token = create_access_token(user.id, user.email)
    plain_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(plain_refresh)

    rt = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        device_info=device_info,
        expires_at=refresh_token_expiry(),
    )
    db.add(rt)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": plain_refresh,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email},
    }


def _revoke_refresh_token(db: Session, plain_token: str) -> bool:
    """
    Find the matching refresh token row and mark it revoked.
    Returns True if found and revoked, False if not found.
    """
    # Must check all non-revoked tokens — bcrypt can't be indexed
    active_tokens = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        .all()
    )
    for rt in active_tokens:
        if verify_refresh_token(plain_token, rt.token_hash):
            rt.revoked_at = datetime.now(timezone.utc)
            db.commit()
            return True
    return False


def _find_valid_refresh_token(db: Session, plain_token: str) -> Optional[RefreshToken]:
    """
    Find a valid (not revoked, not expired) refresh token matching the plain string.
    Returns the RefreshToken ORM row or None.
    """
    active_tokens = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        .all()
    )
    for rt in active_tokens:
        if verify_refresh_token(plain_token, rt.token_hash):
            return rt
    return None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already registered.")

    user = User(email=email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    # First user claims any legacy orphaned rows (migration compatibility)
    if db.query(User).count() == 1:
        has_legacy = db.query(LearningEntry).filter(LearningEntry.user_id == 1).first()
        if has_legacy and user.id != 1:
            for model in (LearningEntry, QuizResult, TopicReview, DailyDiary, Streak):
                db.query(model).filter(model.user_id == 1).update(
                    {model.user_id: user.id}, synchronize_session=False
                )
            db.commit()
            logger.info("Assigned legacy data to user id=%s", user.id)

    device_info = request.headers.get("User-Agent", "")[:200]
    tokens = _issue_tokens(db, user, device_info)
    logger.info("New user registered: %s (id=%s)", email, user.id)
    return tokens


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")

    device_info = request.headers.get("User-Agent", "")[:200]
    tokens = _issue_tokens(db, user, device_info)
    logger.info("User logged in: %s (id=%s)", email, user.id)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(req: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    """
    Validate the refresh token, revoke it, and issue a new token pair.
    This endpoint is called by:
      - The frontend Axios interceptor on 401
      - The Chrome extension background.js on 401

    Security: uses bcrypt comparison (timing-safe).
    If token is invalid/expired/revoked → 401.
    """
    rt_row = _find_valid_refresh_token(db, req.refresh_token)
    if not rt_row:
        raise HTTPException(401, "Refresh token is invalid, expired, or already used.")

    user = db.query(User).filter(User.id == rt_row.user_id).first()
    if not user:
        raise HTTPException(401, "User not found.")

    # Revoke the old refresh token (rotation)
    rt_row.revoked_at = datetime.now(timezone.utc)
    db.commit()

    # Issue new pair
    device_info = request.headers.get("User-Agent", "")[:200]
    tokens = _issue_tokens(db, user, device_info)
    logger.info("Tokens refreshed for user id=%s", user.id)
    return tokens


@router.post("/logout")
async def logout(req: LogoutRequest, db: Session = Depends(get_db)):
    """Revoke the provided refresh token. Idempotent — 200 even if not found."""
    revoked = _revoke_refresh_token(db, req.refresh_token)
    if revoked:
        logger.info("Refresh token revoked.")
    return {"success": True, "message": "Logged out successfully."}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}


@router.get("/export")
async def export_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GDPR-style export of all user data."""
    entries = (
        db.query(LearningEntry)
        .filter(LearningEntry.user_id == current_user.id)
        .all()
    )
    quizzes = (
        db.query(QuizResult)
        .filter(QuizResult.user_id == current_user.id)
        .all()
    )
    topics = (
        db.query(TopicReview)
        .filter(TopicReview.user_id == current_user.id)
        .all()
    )
    diaries = (
        db.query(DailyDiary)
        .filter(DailyDiary.user_id == current_user.id)
        .all()
    )

    return {
        "exported_at": date.today().isoformat(),
        "user": {"id": current_user.id, "email": current_user.email},
        "entries": [
            {
                "id": e.id,
                "source_type": e.source_type,
                "title": e.title,
                "source_url": e.source_url,
                "summary": e.summary,
                "topics": e.topics,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "quiz_results": [
            {
                "question": q.question,
                "topic": q.topic,
                "is_correct": q.is_correct,
                "attempted_at": q.attempted_at.isoformat() if q.attempted_at else None,
            }
            for q in quizzes
        ],
        "topic_reviews": [
            {
                "topic": t.topic,
                "interval_days": t.interval_days,
                "last_reviewed": t.last_reviewed.isoformat() if t.last_reviewed else None,
            }
            for t in topics
        ],
        "diaries": [
            {"date": d.date.isoformat(), "summary": d.summary}
            for d in diaries
        ],
    }


@router.delete("/account")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all user data and the account."""
    uid = current_user.id
    db.query(LearningEntry).filter(LearningEntry.user_id == uid).delete()
    db.query(QuizResult).filter(QuizResult.user_id == uid).delete()
    db.query(TopicReview).filter(TopicReview.user_id == uid).delete()
    db.query(DailyDiary).filter(DailyDiary.user_id == uid).delete()
    db.query(RefreshToken).filter(RefreshToken.user_id == uid).delete()
    db.query(User).filter(User.id == uid).delete()
    db.commit()
    logger.warning("Account deleted: user_id=%s", uid)
    return {"message": "Account and all data deleted."}
