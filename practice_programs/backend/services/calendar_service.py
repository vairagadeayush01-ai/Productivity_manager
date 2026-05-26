import os
import json
import urllib.parse
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from database import User
from core.encryption import encrypt, decrypt
from typing import Optional
from groq import Groq

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

def push_event_to_google_calendar(user_id: int, db: Session, title: str, description: str, start_time: datetime, end_time: datetime) -> str:
    """Create a new event in the user's primary Google Calendar."""
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    
    # Ensure timezone awareness (default to UTC if naive)
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
        
    body = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_time.isoformat()},
        "end": {"dateTime": end_time.isoformat()}
    }
    data = perform_api_call_with_refresh(user_id, db, "POST", url, json=body)
    return data.get("id")

def extract_schedule_intent(text: str) -> list[dict]:
    """Parse natural language into a list of structured schedule intents using Groq."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")
        
    client = Groq(api_key=api_key)
    # Give the LLM a clear temporal anchor
    now = datetime.now(timezone.utc)
    system_prompt = f"""
    You are an NLP scheduling assistant. The current date and time is {now.isoformat()}.
    Extract the scheduling intent from the user's text and output a JSON array of events.
    Each event must have exactly:
    - "title": string
    - "description": string (can be empty)
    - "start_time": string (ISO 8601 format, e.g., "2024-10-25T14:00:00Z")
    - "end_time": string (ISO 8601 format)
    
    Make reasonable assumptions for duration if unspecified (e.g. 1 hour).
    Output ONLY valid JSON. No markdown formatting, no explanations. Just the JSON array.
    """
    
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
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
