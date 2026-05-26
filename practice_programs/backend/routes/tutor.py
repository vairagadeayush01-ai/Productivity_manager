"""
routes/tutor.py — AI Tutor session management endpoints.

POST /tutor/session              → create or resume active session
GET  /tutor/session/current      → get current session + message history
POST /tutor/session/{id}/message → SSE stream tutor response
GET  /tutor/sessions/distilled   → list past distilled session summaries
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import TutorConversation, User, get_db
from services import tutor_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tutor", tags=["tutor"])


class StartSessionRequest(BaseModel):
    topic: str | None = Field(None, max_length=100,
        description="Optional topic hint for this session (e.g. 'binary trees')")


class MessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


# ─── Session lifecycle ────────────────────────────────────────────────────────

@router.post("/session")
def start_session(
    body: StartSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new session or resume the existing active one (< 24h old).
    Returns session metadata. Previous expired sessions are distilled here.
    """
    conv = tutor_service.create_or_resume_session(current_user.id, db, body.topic)
    msgs = tutor_service.get_session_history(conv.id, db)
    return {
        "session_id":  conv.id,
        "topic":       body.topic,
        "expires_at":  conv.expires_at.isoformat() if conv.expires_at else None,
        "created_at":  conv.created_at.isoformat() if conv.created_at else None,
        "message_count": len(msgs),
        "history":     msgs,
    }


@router.get("/session/current")
def get_current_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns current active session and its message history. 404 if none."""
    from datetime import datetime
    now = datetime.utcnow()
    conv = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == current_user.id,
            TutorConversation.expires_at > now,
        )
        .order_by(TutorConversation.created_at.desc())
        .first()
    )
    if not conv:
        return {"session_id": None, "history": [], "message_count": 0}

    msgs = tutor_service.get_session_history(conv.id, db)
    return {
        "session_id":    conv.id,
        "expires_at":    conv.expires_at.isoformat(),
        "message_count": len(msgs),
        "history":       msgs,
    }


# ─── Message streaming ────────────────────────────────────────────────────────

@router.post("/session/{session_id}/message")
async def send_message(
    session_id: int = Path(..., ge=1),
    body: MessageRequest = ...,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a message to the tutor and receive a streaming SSE response.

    SSE format:
      data: <token>
      data: [SOURCES_JSON] [...]
      data: [DONE]
    """
    from datetime import datetime

    # Verify session belongs to this user and is still active
    conv = db.query(TutorConversation).filter(
        TutorConversation.id == session_id,
        TutorConversation.user_id == current_user.id,
    ).first()

    if not conv:
        raise HTTPException(404, "Session not found.")

    if conv.expires_at and conv.expires_at < datetime.utcnow():
        raise HTTPException(410, "Session has expired. Start a new session.")

    def generate():
        try:
            yield from tutor_service.stream_tutor_response(
                conv_id=session_id,
                user_message=body.message,
                user_id=current_user.id,
                db=db,
            )
        except Exception as exc:
            logger.error("[Tutor] Stream error session=%s: %s", session_id, exc)
            yield f"data: [Error: {exc}]\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Distilled session history ────────────────────────────────────────────────

@router.get("/sessions/distilled")
def get_distilled_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns past session summaries (distilled_summary) — not the full messages.
    Ordered newest first. Useful for: 'What did I study last week?'
    """
    sessions = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == current_user.id,
            TutorConversation.distilled_summary.isnot(None),
        )
        .order_by(TutorConversation.distilled_at.desc())
        .limit(20)
        .all()
    )
    return {
        "count": len(sessions),
        "sessions": [
            {
                "id":               s.id,
                "distilled_summary": s.distilled_summary,
                "distilled_at":     s.distilled_at.isoformat() if s.distilled_at else None,
                "created_at":       s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
    }
