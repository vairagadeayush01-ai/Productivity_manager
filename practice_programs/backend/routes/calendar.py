from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel

from database import get_db, User, CalendarEvent
from core.deps import get_current_user
from services.calendar_service import (
    get_oauth_url, exchange_code, push_event_to_google_calendar, extract_schedule_intent
)

router = APIRouter(tags=["Calendar"])

class CallbackRequest(BaseModel):
    code: str

class ScheduleRequest(BaseModel):
    text: str

@router.get("/auth")
def get_auth_url(frontend_url: str = "http://localhost:5173", _: User = Depends(get_current_user)):
    try:
        url = get_oauth_url(frontend_url)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/callback")
def handle_callback(req: CallbackRequest, frontend_url: str = "http://localhost:5173", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        exchange_code(req.code, current_user.id, db, frontend_url)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/schedule")
def schedule_from_text(req: ScheduleRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        intents = extract_schedule_intent(req.text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract intent: {str(e)}")
        
    created_events = []
    
    for intent in intents:
        try:
            # Parse ISO 8601 strings from LLM, handle 'Z'
            start_str = intent["start_time"].replace("Z", "+00:00")
            end_str = intent["end_time"].replace("Z", "+00:00")
            
            start_time = datetime.fromisoformat(start_str)
            end_time = datetime.fromisoformat(end_str)
            
            # Push to Google Calendar
            google_event_id = None
            sync_error = None
            try:
                google_event_id = push_event_to_google_calendar(
                    current_user.id, db,
                    title=intent["title"],
                    description=intent.get("description", ""),
                    start_time=start_time,
                    end_time=end_time
                )
            except Exception as e:
                sync_error = str(e)
                
            new_event = CalendarEvent(
                user_id=current_user.id,
                google_event_id=google_event_id,
                title=intent["title"],
                description=intent.get("description", ""),
                start_time=start_time.replace(tzinfo=None), # Store as naive in DB
                end_time=end_time.replace(tzinfo=None),
                status="synced" if google_event_id else "failed"
            )
            db.add(new_event)
            db.commit()
            db.refresh(new_event)
            
            created_events.append({
                "id": new_event.id,
                "title": new_event.title,
                "start_time": new_event.start_time.isoformat() + "Z",
                "end_time": new_event.end_time.isoformat() + "Z",
                "status": new_event.status,
                "error": sync_error
            })
        except Exception as e:
            continue
            
    return {"created": created_events}

@router.get("/events")
def list_events(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    events = db.query(CalendarEvent).filter(CalendarEvent.user_id == current_user.id).order_by(CalendarEvent.start_time.desc()).limit(50).all()
    return [{
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "start_time": e.start_time.isoformat() + "Z" if e.start_time else None,
        "end_time": e.end_time.isoformat() + "Z" if e.end_time else None,
        "status": e.status,
        "google_event_id": e.google_event_id
    } for e in events]

@router.delete("/disconnect")
def disconnect_calendar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.google_credentials_enc = None
    db.commit()
    return {"status": "success"}
