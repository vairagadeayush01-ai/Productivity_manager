from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import date as date_type
from database import get_db, DailyDiary, LearningEntry
from services import summarizer
import os

router = APIRouter(prefix="/diary", tags=["diary"])

def generate_diary_for_date(db: Session, target_date: str):
    """Background task to generate diary for a specific date if it doesn't exist."""
    # Check if already exists
    existing = db.query(DailyDiary).filter(DailyDiary.date == target_date).first()
    if existing:
        return
    
    # Get all entries for this date
    entries = db.query(LearningEntry).filter(
        LearningEntry.created_at >= f"{target_date} 00:00:00",
        LearningEntry.created_at <= f"{target_date} 23:59:59"
    ).order_by(LearningEntry.created_at.asc()).all()

    if not entries:
        return

    # Combine text
    combined_text = ""
    for idx, e in enumerate(entries):
        combined_text += f"{idx+1}. [{e.source_type.upper()}] {e.title}\nSummary: {e.summary}\nTopics: {e.topics}\n\n"

    try:
        diary_summary = summarizer.summarize_daily_diary(combined_text, target_date)
        
        diary_entry = DailyDiary(
            date=date_type.fromisoformat(target_date),
            summary=diary_summary
        )
        db.add(diary_entry)
        db.commit()
    except Exception as e:
        print(f"Failed to generate daily diary for {target_date}: {e}")
        db.rollback()


@router.get("/")
async def get_diaries(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Fetch all daily diaries, ordered by date."""
    
    # First, let's trigger a background job to generate today's diary if it's not generated yet
    # Or actually, we should just let them fetch, and we can generate on the fly for today
    # But to prevent blocking, we'll trigger generation for today in the background, 
    # so next time they refresh it's there. 
    # Or, for better UX, if today is missing, we could generate it synchronously if there are entries.
    
    today_str = date_type.today().isoformat()
    existing_today = db.query(DailyDiary).filter(DailyDiary.date == today_str).first()
    
    # Check if we have entries today, and if the diary doesn't exist, we can generate it immediately
    if not existing_today:
        entries = db.query(LearningEntry).filter(
            LearningEntry.created_at >= f"{today_str} 00:00:00"
        ).count()
        if entries > 0:
            generate_diary_for_date(db, today_str)

    diaries = db.query(DailyDiary).order_by(DailyDiary.date.desc()).all()
    
    return {"diaries": [
        {"id": d.id, "date": d.date.isoformat(), "summary": d.summary, "created_at": d.created_at.isoformat()}
        for d in diaries
    ]}


@router.get("/{target_date}")
async def get_diary(target_date: str, db: Session = Depends(get_db)):
    """Fetch a specific daily diary."""
    diary = db.query(DailyDiary).filter(DailyDiary.date == target_date).first()
    
    # If not found, try to generate it
    if not diary:
        generate_diary_for_date(db, target_date)
        diary = db.query(DailyDiary).filter(DailyDiary.date == target_date).first()
        
    if not diary:
        return {"id": None, "date": target_date, "summary": "No activities found for this date.", "created_at": None}
        
    return {"id": diary.id, "date": diary.date.isoformat(), "summary": diary.summary, "created_at": diary.created_at.isoformat()}
