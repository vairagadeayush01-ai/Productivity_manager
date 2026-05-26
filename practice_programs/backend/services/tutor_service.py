"""
services/tutor_service.py — AI Tutor with 24h session memory + distillation.

Memory lifecycle:
  ACTIVE (0-24h):
    - Full message history stored in tutor_messages (up to last 8 turns)
    - All messages injected into every Groq call as conversation history
    - RAG context also injected in system prompt (up to 4 relevant sources)

  EXPIRED (>24h):
    - distill_and_cleanup() called by scheduler or on next session create
    - Groq generates a compact distilled_summary from the message history
    - All tutor_messages for that conversation are deleted
    - distilled_summary saved on the TutorConversation row
    - Future sessions optionally see: "In a previous session you explored: ..."

Endpoints use:
  - create_or_resume_session(user_id, db) → TutorConversation
  - add_user_message(conv_id, content, db) → TutorMessage
  - stream_tutor_response(conv_id, user_message, user_id, db) → Iterator[str]
  - distill_expired_sessions(user_id, db) → int (count distilled)
"""
import json
import logging
import os
from collections.abc import Iterator
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from database import TutorConversation, TutorMessage
from services import vector_store

logger = logging.getLogger(__name__)

_GROQ_MODEL     = "llama-3.3-70b-versatile"
_SESSION_TTL_H  = 24
_MAX_HISTORY    = 8       # turns kept in DB + injected into Groq
_MAX_RAG_SOURCES = 4


def _get_groq():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None
    try:
        from groq import Groq
        return Groq(api_key=api_key)
    except Exception as exc:
        logger.warning("Groq init failed: %s", exc)
        return None


# ─── Session management ───────────────────────────────────────────────────────

def create_or_resume_session(user_id: int, db: Session, topic: str | None = None) -> TutorConversation:
    """
    Returns the active tutor session for this user (if <24h old),
    or creates a fresh one. Also triggers distillation of any expired sessions.
    """
    # Distill expired sessions first (background cleanup)
    _distill_expired_for_user(user_id, db)

    # Look for an unexpired session
    now = datetime.utcnow()
    conv = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == user_id,
            TutorConversation.expires_at > now,
        )
        .order_by(TutorConversation.created_at.desc())
        .first()
    )

    if conv:
        return conv

    # Create new session
    conv = TutorConversation(
        user_id      = user_id,
        context_type = "general",
        source_ref   = json.dumps({"topic": topic}) if topic else "{}",
        expires_at   = now + timedelta(hours=_SESSION_TTL_H),
        created_at   = now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    logger.info("[Tutor] New session %s created for user %s", conv.id, user_id)
    return conv


def _get_messages(conv_id: int, db: Session) -> list[TutorMessage]:
    """Last N messages for this conversation, ordered oldest → newest."""
    return (
        db.query(TutorMessage)
        .filter(TutorMessage.conversation_id == conv_id)
        .order_by(TutorMessage.created_at.asc())
        .all()
    )[-_MAX_HISTORY:]


def save_message(conv_id: int, role: str, content: str, db: Session) -> TutorMessage:
    """Persist a single message (role='user' or 'assistant')."""
    msg = TutorMessage(
        conversation_id = conv_id,
        role            = role,
        content         = content,
        source_refs     = "[]",
        created_at      = datetime.utcnow(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ─── Streaming response ───────────────────────────────────────────────────────

def stream_tutor_response(
    conv_id: int,
    user_message: str,
    user_id: int,
    db: Session,
) -> Iterator[str]:
    """
    Yields SSE data chunks for the tutor's reply.

    Flow:
      1. Save user message to DB
      2. Load last 8 messages as conversation history
      3. Retrieve up to 4 RAG sources relevant to user_message
      4. Build Groq messages array: system + history + current user turn
      5. Stream Groq response
      6. Save assistant reply to DB
      7. Emit [SOURCES_JSON] block
      8. Emit [DONE]
    """
    groq = _get_groq()

    # 1. Persist user message
    save_message(conv_id, "user", user_message, db)

    # 2. Load history
    history_msgs = _get_messages(conv_id, db)

    # 3. RAG retrieval
    rag_raw = vector_store.search(query=user_message, n_results=_MAX_RAG_SOURCES, user_id=user_id)
    sources = []
    context_block = ""
    if rag_raw:
        parts = []
        for r in rag_raw:
            meta  = r.get("metadata", {})
            doc   = r.get("document", "")
            title = meta.get("title", "Untitled")
            stype = meta.get("source_type", "manual")
            date  = meta.get("date", "")
            sources.append({
                "id":          r["id"],
                "title":       title,
                "source_type": stype,
                "date":        date,
                "url":         meta.get("url", ""),
                "snippet":     doc[:200],
            })
            parts.append(f"[{stype.upper()}] {title}" + (f" ({date})" if date else "") + f"\n{doc[:350]}")
        context_block = "\n---\n".join(parts)

    # 4. Load distilled summary from previous sessions
    past_summary = _get_past_distillation(user_id, conv_id, db)

    # Build system prompt
    system_parts = [
        "You are the user's personal AI tutor. You have access to their learning notes and code history.",
        "Speak directly to them. Be precise, technical, and encouraging.",
        "Cite sources inline as [SOURCE: Title] when referencing their notes.",
        "If a follow-up question references something said earlier, connect the threads.",
        "Never fabricate facts or code.",
    ]
    if context_block:
        system_parts.append(f"\nRELEVANT NOTES FROM USER'S HISTORY:\n{context_block}")
    if past_summary:
        system_parts.append(f"\nPREVIOUS SESSION CONTEXT:\n{past_summary}")
    if not context_block and not past_summary:
        system_parts.append(
            "\nNo relevant notes found yet. Answer from general knowledge but note "
            "that the user should add more learning entries to get personalized answers."
        )

    system_content = "\n".join(system_parts)

    # Build messages array
    groq_messages = [{"role": "system", "content": system_content}]

    # Add history (excluding the user turn we just saved — it's added last)
    for m in history_msgs[:-1]:  # skip last because it IS the current user message
        groq_messages.append({"role": m.role, "content": m.content})

    # Add current user turn
    groq_messages.append({"role": "user", "content": user_message})

    # 5. Stream
    if not groq:
        reply_text = "AI unavailable — GROQ_API_KEY not set."
        yield f"data: {reply_text}\n\n"
        save_message(conv_id, "assistant", reply_text, db)
        yield "data: [DONE]\n\n"
        return

    full_reply = []
    try:
        stream = groq.chat.completions.create(
            model=_GROQ_MODEL,
            messages=groq_messages,
            temperature=0.4,
            max_tokens=700,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                full_reply.append(delta)
                yield f"data: {delta}\n\n"

    except Exception as exc:
        logger.error("[Tutor] Groq stream error conv=%s: %s", conv_id, exc)
        yield f"data: [Error: {exc}]\n\n"

    # 6. Save assistant reply
    reply_content = "".join(full_reply)
    if reply_content:
        save_message(conv_id, "assistant", reply_content, db)

    # 7. Emit sources
    yield f"data: [SOURCES_JSON] {json.dumps(sources)}\n\n"
    yield "data: [DONE]\n\n"


def _get_past_distillation(user_id: int, current_conv_id: int, db: Session) -> str:
    """
    Load the most recent distilled_summary from a previous (expired) session.
    Returns '' if none found.
    """
    prev = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == user_id,
            TutorConversation.id != current_conv_id,
            TutorConversation.distilled_summary.isnot(None),
        )
        .order_by(TutorConversation.distilled_at.desc())
        .first()
    )
    return prev.distilled_summary if prev else ""


# ─── Distillation + cleanup ───────────────────────────────────────────────────

def _distill_single_session(conv: TutorConversation, db: Session) -> bool:
    """
    Distill one expired conversation:
      1. Load all messages
      2. Call Groq to generate a compact summary of key insights
      3. Save summary to conv.distilled_summary
      4. Delete all messages
      5. Mark conv as distilled

    Returns True on success, False on failure (conv not touched on failure).
    """
    groq = _get_groq()
    messages = (
        db.query(TutorMessage)
        .filter(TutorMessage.conversation_id == conv.id)
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    if not messages:
        # Nothing to distill — mark as complete anyway
        conv.distilled_summary = "(No messages — session was empty)"
        conv.distilled_at = datetime.utcnow()
        db.commit()
        return True

    # Format conversation for Groq
    dialogue = "\n".join(
        f"{m.role.upper()}: {m.content[:400]}"
        for m in messages
    )

    if not groq:
        logger.warning("[Tutor] Skipping distillation — no Groq key")
        return False

    prompt = f"""Summarize this AI tutoring session into a compact knowledge snapshot.

CONVERSATION:
{dialogue[:4000]}

Write a 3-6 sentence summary capturing:
1. What topics were discussed
2. Key insights or explanations given
3. Any open questions or areas the student found confusing
4. What the student seemed to understand well

Keep it dense and factual — this will seed future tutoring sessions."""

    try:
        resp = groq.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=400,
        )
        summary = resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("[Tutor] Distillation Groq error conv=%s: %s", conv.id, exc)
        return False

    # Save summary + delete messages
    conv.distilled_summary = summary
    conv.distilled_at = datetime.utcnow()
    db.query(TutorMessage).filter(TutorMessage.conversation_id == conv.id).delete()
    db.commit()
    logger.info("[Tutor] Distilled session %s → %d chars summary", conv.id, len(summary))
    return True


def _distill_expired_for_user(user_id: int, db: Session) -> int:
    """
    Find all expired, non-distilled sessions for this user and distill them.
    Returns count of sessions distilled.
    """
    now = datetime.utcnow()
    expired = (
        db.query(TutorConversation)
        .filter(
            TutorConversation.user_id == user_id,
            TutorConversation.expires_at <= now,
            TutorConversation.distilled_at.is_(None),
        )
        .all()
    )
    count = 0
    for conv in expired:
        if _distill_single_session(conv, db):
            count += 1
    return count


def get_session_history(conv_id: int, db: Session) -> list[dict]:
    """Return message history for the frontend (without raw DB objects)."""
    msgs = _get_messages(conv_id, db)
    return [
        {
            "role":       m.role,
            "content":   m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]
