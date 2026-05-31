from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import zoneinfo
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
    timezone: str | None = None
    local_time: str | None = None

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
        intents = extract_schedule_intent(req.text, req.timezone, req.local_time)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract intent: {str(e)}")
        
    created_events = []
    
    for intent in intents:
        try:
            # Strip any timezone suffix (Z, +05:30, -05:00) to get a naive datetime string
            import re
            tz_pattern = re.compile(r'(Z|[+-]\d{2}:\d{2})$')
            start_str = tz_pattern.sub('', intent["start_time"])
            end_str   = tz_pattern.sub('', intent["end_time"])
            
            start_time = datetime.fromisoformat(start_str)
            end_time = datetime.fromisoformat(end_str)
            
            # Attach user timezone
            if req.timezone:
                local_tz = zoneinfo.ZoneInfo(req.timezone)
                start_time = start_time.replace(tzinfo=local_tz)
                end_time = end_time.replace(tzinfo=local_tz)
            else:
                start_time = start_time.replace(tzinfo=timezone.utc)
                end_time = end_time.replace(tzinfo=timezone.utc)
            
            # Push to Google Calendar
            google_event_id = None
            sync_error = None
            try:
                google_event_id = push_event_to_google_calendar(
                    current_user.id, db,
                    title=intent["title"],
                    description=intent.get("description", ""),
                    start_time=start_time,
                    end_time=end_time,
                    user_timezone=req.timezone or "UTC"
                )
            except Exception as e:
                sync_error = str(e)
                
            new_event = CalendarEvent(
                user_id=current_user.id,
                google_event_id=google_event_id,
                title=intent["title"],
                description=intent.get("description", ""),
                start_time=start_time.astimezone(timezone.utc).replace(tzinfo=None), # Store as naive in DB
                end_time=end_time.astimezone(timezone.utc).replace(tzinfo=None),
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
    from datetime import timedelta
    # Auto-delete events older than 7 days
    cutoff = datetime.utcnow() - timedelta(days=7)
    db.query(CalendarEvent).filter(
        CalendarEvent.user_id == current_user.id,
        CalendarEvent.end_time < cutoff
    ).delete()
    db.commit()

    events = db.query(CalendarEvent).filter(CalendarEvent.user_id == current_user.id).order_by(CalendarEvent.start_time.asc()).all()
    return [{
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "start_time": e.start_time.isoformat() + "Z" if e.start_time else None,
        "end_time": e.end_time.isoformat() + "Z" if e.end_time else None,
        "status": e.status,
        "google_event_id": e.google_event_id
    } for e in events]

@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == current_user.id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Also delete from Google Calendar if synced
    if event.google_event_id:
        try:
            from services.calendar_service import perform_api_call_with_refresh
            url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event.google_event_id}"
            # DELETE returns 204 (no content), so we call directly
            import json, requests
            from core.encryption import decrypt
            user = db.query(User).filter(User.id == current_user.id).first()
            creds = json.loads(decrypt(user.google_credentials_enc))
            headers = {"Authorization": f"Bearer {creds.get('access_token')}"}
            requests.delete(url, headers=headers)
        except Exception:
            pass  # Don't block local delete if Google delete fails
    
    db.delete(event)
    db.commit()
    return {"status": "deleted"}

@router.delete("/disconnect")
def disconnect_calendar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.google_credentials_enc = None
    db.commit()
    return {"status": "success"}
