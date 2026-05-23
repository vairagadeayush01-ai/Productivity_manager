from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import User, get_db
from services import spaced_repetition, weekly_report

router = APIRouter(prefix="/report", tags=["report"])


@router.get("/weekly")
async def get_weekly_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return weekly_report.generate_weekly_report(db, current_user.id)


@router.get("/topics")
async def get_all_topics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"topics": spaced_repetition.get_all_topics(db, current_user.id)}
