"""
routes/report.py — Report endpoints with SSE streaming support.

GET /report/weekly         — legacy blocking (keeps backward compat)
GET /report/weekly/stream  — SSE streaming (consumed by useReportStream hook)
GET /report/topics         — topic list for quiz navigation
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import User, get_db
from services import spaced_repetition, weekly_report

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/report", tags=["report"])


@router.get("/weekly")
async def get_weekly_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Blocking endpoint — kept for backward compatibility."""
    return weekly_report.generate_weekly_report(db, current_user.id)


@router.get(
    "/weekly/stream",
    response_class=StreamingResponse,
    summary="Stream the weekly report as Server-Sent Events",
    description=(
        "Returns a text/event-stream response. Events: "
        "stats (immediate), chunk (AI delta), section (completed section), "
        "done (final parsed report), error (recoverable or fatal)."
    ),
)
async def stream_weekly_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    SSE streaming endpoint for the weekly AI report.

    The client should use EventSource or a manual fetch with ReadableStream.
    Auth is via Bearer token in the Authorization header.

    Note: EventSource API does NOT support custom headers, so the frontend
    uses fetch() with manual SSE parsing instead of native EventSource.
    """
    logger.info("[Report] Streaming report for user_id=%s", current_user.id)

    return StreamingResponse(
        weekly_report.stream_weekly_report(db, current_user.id),
        media_type="text/event-stream",
        headers={
            # Prevent buffering in nginx/proxies
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            # CORS for localhost dev
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/topics")
async def get_all_topics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"topics": spaced_repetition.get_all_topics(db, current_user.id)}
