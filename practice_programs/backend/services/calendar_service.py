import os
import json
import urllib.parse
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from database import User
from core.encryption import encrypt, decrypt
from typing import Optional
from core.llm import create_chat_completion

def get_oauth_url(frontend_url: str = "http://localhost:5173") -> str:
    """Generate the Google OAuth2 consent URL."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise ValueError("GOOGLE_CLIENT_ID not configured in .env")
    
    redirect_uri = f"{frontend_url}/profile"
    scope = "https://www.googleapis.com/auth/calendar.events"
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent"
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

def exchange_code(code: str, user_id: int, db: Session, frontend_url: str = "http://localhost:5173"):
    """Exchange OAuth code for tokens and save to user's encrypted credentials."""
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = f"{frontend_url}/profile"
    
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri
    })
    
    if not resp.ok:
        raise ValueError(f"Failed to exchange code: {resp.text}")
        
    token_data = resp.json()
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.google_credentials_enc = encrypt(json.dumps(token_data))
        db.commit()

def perform_api_call_with_refresh(user_id: int, db: Session, method: str, url: str, **kwargs):
    """Make an authenticated call to Google API, handling token refresh automatically."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.google_credentials_enc:
        raise ValueError("Google Calendar not connected")
        
    try:
        creds = json.loads(decrypt(user.google_credentials_enc))
    except Exception:
        raise ValueError("Invalid Google credentials")
        
    access_token = creds.get("access_token")
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {access_token}"
    
    resp = requests.request(method, url, headers=headers, **kwargs)
    
    if resp.status_code == 401 and "refresh_token" in creds:
        # Refresh token
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        refresh_resp = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": creds["refresh_token"],
            "grant_type": "refresh_token"
        })
        if refresh_resp.ok:
            new_data = refresh_resp.json()
            creds["access_token"] = new_data["access_token"]
            if "refresh_token" in new_data:
                creds["refresh_token"] = new_data["refresh_token"]
            user.google_credentials_enc = encrypt(json.dumps(creds))
            db.commit()
            
            headers["Authorization"] = f"Bearer {creds['access_token']}"
            resp = requests.request(method, url, headers=headers, **kwargs)
            
    if not resp.ok:
        raise ValueError(f"Google API Error: {resp.text}")
        
    return resp.json()

def push_event_to_google_calendar(user_id: int, db: Session, title: str, description: str, start_time: datetime, end_time: datetime, user_timezone: str = "UTC") -> str:
    """Create a new event in the user's primary Google Calendar."""
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    
    # Strip any timezone info and send as naive local datetime string.
    # When paired with the timeZone field, Google Calendar treats the datetime
    # as local time in that timezone — regardless of the calendar's own display timezone.
    def naive_iso(dt: datetime) -> str:
        # Convert to the user's local time if offset-aware, then strip offset
        if dt.tzinfo is not None:
            import zoneinfo
            try:
                local_tz = zoneinfo.ZoneInfo(user_timezone)
                dt = dt.astimezone(local_tz)
            except Exception:
                pass
        return dt.strftime("%Y-%m-%dT%H:%M:%S")

    body = {
        "summary": title,
        "description": description,
        "start": {"dateTime": naive_iso(start_time), "timeZone": user_timezone},
        "end":   {"dateTime": naive_iso(end_time),   "timeZone": user_timezone}
    }
    data = perform_api_call_with_refresh(user_id, db, "POST", url, json=body)
    return data.get("id")

def extract_schedule_intent(text: str, user_timezone: str = None, local_time: str = None) -> list[dict]:
    """Parse natural language into a list of structured schedule intents using Groq."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")
    
    # Use provided local time/tz or fallback to UTC
    if local_time and user_timezone:
        time_context = f"The user's current local date and time is {local_time}. The user is in the {user_timezone} timezone."
    else:
        now = datetime.now(timezone.utc)
        time_context = f"The current date and time is {now.isoformat()} (UTC)."

    system_prompt = f"""
    You are an NLP scheduling assistant. {time_context}
    Extract the scheduling intent from the user's text and output a JSON array of events.
    Each event must have exactly:
    - "title": string (concise event name)
    - "description": string — include ALL of the following in the description if present:
        * Any URLs, meeting links, or web addresses mentioned (e.g. Zoom/Meet links, registration URLs)
        * Location or room information
        * Any notes, instructions, or additional context the user mentioned
        * If nothing extra was provided, leave this as an empty string ""
    - "start_time": string (ISO 8601 format WITHOUT timezone offset, e.g., "2024-10-25T14:00:00")
    - "end_time": string (ISO 8601 format WITHOUT timezone offset)
    
    Make sure you calculate the correct local time based on the user's timezone, but do NOT include the 'Z' or '+05:30' offset in the string.
    Make reasonable assumptions for duration if unspecified (e.g. 1 hour).
    Output ONLY valid JSON. No markdown formatting, no explanations. Just the JSON array.
    """
    
    resp = create_chat_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        temperature=0.0
    )
    
    content = resp.choices[0].message.content.strip()
    if content.startswith("```json"):
        content = content[7:-3]
    elif content.startswith("```"):
        content = content[3:-3]
        
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        raise ValueError("Failed to parse LLM intent extraction into JSON.")
