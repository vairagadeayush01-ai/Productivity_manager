"""
routes/chat.py — "Chat With My Data" RAG endpoint.

POST /chat/ask   — SSE stream: retrieve context → Groq answer → [SOURCES_JSON]
GET  /chat/sources?q=... — dry run: returns only what sources would be cited (no LLM)
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import User, get_db
from services.rag_service import retrieve_context, stream_rag_answer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class AskRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)


@router.post("/ask")
async def ask(
    body: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    SSE stream endpoint.

    Client reads line-by-line:
      data: <token>          ← streaming text tokens
      data: [SOURCES_JSON] [...] ← JSON array of cited sources
      data: [DONE]           ← stream complete

    Frontend: use fetch() + ReadableStream (same pattern as /report/stream).
    """
    def generate():
        try:
            yield from stream_rag_answer(body.query, current_user.id)
        except Exception as exc:
            logger.error("[Chat] Stream error user=%s: %s", current_user.id, exc)
            yield f"data: [Error: {exc}]\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sources")
async def preview_sources(
    q: str = Query(..., min_length=2),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the sources that would be retrieved for a query — no LLM call.
    Useful for the frontend to show a preview before the user sends a message.
    """
    sources, _ = retrieve_context(q, current_user.id)
    return {"query": q, "sources": sources, "count": len(sources)}
