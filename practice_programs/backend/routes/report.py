from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from services import weekly_report, spaced_repetition

router = APIRouter(prefix="/report", tags=["report"])


@router.get("/weekly")
async def get_weekly_report(db: Session = Depends(get_db)):
    """Generates and returns the weekly report card."""
    return weekly_report.generate_weekly_report(db)


@router.get("/topics")
async def get_all_topics(db: Session = Depends(get_db)):
    """Returns all tracked topics with their spaced repetition status."""
    return {"topics": spaced_repetition.get_all_topics(db)}