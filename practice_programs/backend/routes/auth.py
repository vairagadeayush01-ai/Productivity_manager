import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from core.security import create_access_token, hash_password, verify_password
from database import DailyDiary, LearningEntry, QuizResult, TopicReview, User, get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already registered.")

    user = User(email=email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    # First user claims orphaned rows from migration (user_id=1 with no owner)
    if db.query(User).count() == 1:
        has_legacy = db.query(LearningEntry).filter(LearningEntry.user_id == 1).first()
        if has_legacy and user.id != 1:
            from database import Streak

            for model in (LearningEntry, QuizResult, TopicReview, DailyDiary, Streak):
                db.query(model).filter(model.user_id == 1).update(
                    {model.user_id: user.id}, synchronize_session=False
                )
            db.commit()
            logger.info("Assigned legacy data to user id=%s", user.id)

    token = create_access_token(user.id, user.email)
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email},
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    token = create_access_token(user.id, user.email)
    return TokenResponse(
        access_token=token,
        user={"id": user.id, "email": user.email},
    )


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

    def entry_dict(e):
        return {
            "id": e.id,
            "source_type": e.source_type,
            "title": e.title,
            "source_url": e.source_url,
            "summary": e.summary,
            "topics": e.topics,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }

    payload = {
        "exported_at": date.today().isoformat(),
        "user": {"id": current_user.id, "email": current_user.email},
        "entries": [entry_dict(e) for e in entries],
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
    return payload


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
    db.query(User).filter(User.id == uid).delete()
    db.commit()
    return {"message": "Account and all data deleted."}
