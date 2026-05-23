import logging
from datetime import date as date_type, datetime

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import DailyDiary, LearningEntry, User, get_db
from services import summarizer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/diary", tags=["diary"])


def _date_range(target_date: str) -> tuple[datetime, datetime]:
    d = date_type.fromisoformat(target_date)
    return datetime.combine(d, datetime.min.time()), datetime.combine(d, datetime.max.time())


def generate_diary_for_date(db: Session, user_id: int, target_date: str):
    d = date_type.fromisoformat(target_date)
    existing = (
        db.query(DailyDiary)
        .filter(DailyDiary.user_id == user_id, DailyDiary.date == d)
        .first()
    )
    if existing:
        return

    start, end = _date_range(target_date)
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == user_id,
            LearningEntry.created_at >= start,
            LearningEntry.created_at <= end,
        )
        .order_by(LearningEntry.created_at.asc())
        .all()
    )

    if not entries:
        return

    combined_text = ""
    for idx, e in enumerate(entries):
        combined_text += (
            f"{idx+1}. [{e.source_type.upper()}] {e.title}\n"
            f"Summary: {e.summary}\nTopics: {e.topics}\n\n"
        )

    try:
        diary_summary = summarizer.summarize_daily_diary(combined_text, target_date)
        db.add(DailyDiary(user_id=user_id, date=d, summary=diary_summary))
        db.commit()
    except Exception:
        logger.exception("Failed to generate daily diary for user %s on %s", user_id, target_date)
        db.rollback()


@router.get("/")
async def get_diaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_str = date_type.today().isoformat()
    d = date_type.fromisoformat(today_str)
    existing_today = (
        db.query(DailyDiary)
        .filter(DailyDiary.user_id == current_user.id, DailyDiary.date == d)
        .first()
    )

    if not existing_today:
        start, _ = _date_range(today_str)
        count = (
            db.query(LearningEntry)
            .filter(
                LearningEntry.user_id == current_user.id,
                LearningEntry.created_at >= start,
            )
            .count()
        )
        if count > 0:
            generate_diary_for_date(db, current_user.id, today_str)

    diaries = (
        db.query(DailyDiary)
        .filter(DailyDiary.user_id == current_user.id)
        .order_by(DailyDiary.date.desc())
        .all()
    )

    return {
        "diaries": [
            {
                "id": diary.id,
                "date": diary.date.isoformat(),
                "summary": diary.summary,
                "created_at": diary.created_at.isoformat(),
            }
            for diary in diaries
        ]
    }


@router.get("/{target_date}")
async def get_diary(
    target_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = date_type.fromisoformat(target_date)
    diary = (
        db.query(DailyDiary)
        .filter(DailyDiary.user_id == current_user.id, DailyDiary.date == d)
        .first()
    )

    if not diary:
        generate_diary_for_date(db, current_user.id, target_date)
        diary = (
            db.query(DailyDiary)
            .filter(DailyDiary.user_id == current_user.id, DailyDiary.date == d)
            .first()
        )

    if not diary:
        return {
            "id": None,
            "date": target_date,
            "summary": "No activities found for this date.",
            "created_at": None,
        }

    return {
        "id": diary.id,
        "date": diary.date.isoformat(),
        "summary": diary.summary,
        "created_at": diary.created_at.isoformat(),
    }
