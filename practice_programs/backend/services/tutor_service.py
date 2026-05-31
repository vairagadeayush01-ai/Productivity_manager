"""
services/tutor_service.py — AI Tutor with 24h session memory + distillation (LangGraph Rewrite).

Memory lifecycle:
  ACTIVE (0-24h):
    - Full message history stored in tutor_messages (up to last 8 turns)
    - LangGraph intent routing determines if retrieval is needed
    - RAG context fetched only if needed, injected into graph state
    - LLM tokens streamed directly from LangGraph to SSE

  EXPIRED (>24h):
    - distill_and_cleanup() generates a compact distilled_summary
    - Old messages are deleted
"""
import json
import logging
import os
from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import TypedDict, Annotated, Literal

from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from core.llm import get_chat_groq
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from database import TutorConversation, TutorMessage
from services import vector_store

logger = logging.getLogger(__name__)

_SESSION_TTL_H  = 24
_MAX_HISTORY    = 8       # turns kept in DB + injected into Groq
_MAX_RAG_SOURCES = 4


def _get_llm():
    try:
        return get_chat_groq(
            temperature=0.4,
            max_tokens=700
        )
    except Exception as exc:
        logger.warning("LangChain ChatGroq init failed: %s", exc)
        return None


# ─── Session management ───────────────────────────────────────────────────────

def create_or_resume_session(user_id: int, db: Session, topic: str | None = None) -> TutorConversation:
    _distill_expired_for_user(user_id, db)

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
    return (
        db.query(TutorMessage)
        .filter(TutorMessage.conversation_id == conv_id)
        .order_by(TutorMessage.created_at.asc())
        .all()
    )[-_MAX_HISTORY:]


def save_message(conv_id: int, role: str, content: str, db: Session) -> TutorMessage:
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


def _get_past_distillation(user_id: int, current_conv_id: int, db: Session) -> str:
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


# ─── LangGraph Definition ─────────────────────────────────────────────────────

class TutorState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    context_block: str
    sources: list[dict]
    user_id: int


class Intent(BaseModel):
    needs_retrieval: bool = Field(description="True if the user is asking about a technical concept, coding problem, or needs information from their notes. False for casual conversation or follow-ups that don't need searching notes.")


def route_intent(state: TutorState) -> Literal["retrieve", "generate"]:
    llm = _get_llm()
    if not llm:
        return "generate"
        
    structured_llm = llm.with_structured_output(Intent)
    try:
        # Only evaluate the last human message for intent
        last_msg = state["messages"][-1]
        intent = structured_llm.invoke([last_msg])
        if intent.needs_retrieval:
            return "retrieve"
    except Exception as e:
        logger.warning("Intent routing failed, defaulting to retrieve: %s", e)
        return "retrieve"
        
    return "generate"


def retrieve_node(state: TutorState):
    last_msg = state["messages"][-1].content
    rag_raw = vector_store.search(query=last_msg, n_results=_MAX_RAG_SOURCES, user_id=state["user_id"])
    
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
        
    return {"context_block": context_block, "sources": sources}


def generate_answer_node(state: TutorState):
    llm = _get_llm()
    
    # Extract the original system message
    original_sys_msg = state["messages"][0].content
    system_parts = [original_sys_msg]
    
    if state.get("context_block"):
        system_parts.append(f"\nRELEVANT NOTES FROM USER'S HISTORY:\n{state['context_block']}")
    else:
        system_parts.append("\nNo relevant notes found yet. Answer from general knowledge but note that the user should add more learning entries to get personalized answers.")
        
    new_sys_msg = SystemMessage(content="\n".join(system_parts))
    
    # Replace the system message, keep the rest
    final_messages = [new_sys_msg] + state["messages"][1:]
    
    response = llm.invoke(final_messages)
    return {"messages": [response]}


builder = StateGraph(TutorState)
builder.add_node("retrieve", retrieve_node)
builder.add_node("generate", generate_answer_node)

builder.add_conditional_edges(START, route_intent)
builder.add_edge("retrieve", "generate")
builder.add_edge("generate", END)

tutor_graph = builder.compile()


# ─── Streaming response ───────────────────────────────────────────────────────

def stream_tutor_response(
    conv_id: int,
    user_message: str,
    user_id: int,
    db: Session,
) -> Iterator[str]:
    """
    Yields SSE data chunks for the tutor's reply using LangGraph.
    """
    if not _get_llm():
        reply_text = "AI unavailable — GROQ_API_KEY not set."
        yield f"data: {reply_text}\n\n"
        save_message(conv_id, "assistant", reply_text, db)
        yield "data: [DONE]\n\n"
        return

    # 1. Persist user message
    save_message(conv_id, "user", user_message, db)

    # 2. Load history & past distillation
    history_msgs = _get_messages(conv_id, db)
    past_summary = _get_past_distillation(user_id, conv_id, db)

    # 3. Build initial LangGraph messages
    sys_prompt = (
        "You are the user's personal AI tutor. You have access to their learning notes and code history.\n"
        "Speak directly to them. Be precise, technical, and encouraging.\n"
        "Cite sources inline as [SOURCE: Title] when referencing their notes.\n"
        "If a follow-up question references something said earlier, connect the threads.\n"
        "Never fabricate facts or code."
    )
    if past_summary:
        sys_prompt += f"\n\nPREVIOUS SESSION CONTEXT:\n{past_summary}"

    initial_messages = [SystemMessage(content=sys_prompt)]
    for m in history_msgs:
        if m.role == "user":
            initial_messages.append(HumanMessage(content=m.content))
        else:
            initial_messages.append(AIMessage(content=m.content))

    # 4. Stream from LangGraph
    full_reply = []
    sources = []
    
    try:
        for event in tutor_graph.stream(
            {"messages": initial_messages, "user_id": user_id, "sources": [], "context_block": ""}, 
            stream_mode=["messages", "values"]
        ):
            kind = event[0]
            if kind == "messages":
                msg_chunk, metadata = event[1]
                if msg_chunk.content and metadata.get("langgraph_node") == "generate":
                    full_reply.append(msg_chunk.content)
                    yield f"data: {msg_chunk.content}\n\n"
            elif kind == "values":
                state = event[1]
                if "sources" in state and state["sources"]:
                    sources = state["sources"]

    except Exception as exc:
        logger.error("[Tutor] LangGraph stream error conv=%s: %s", conv_id, exc)
        yield f"data: [Error: {exc}]\n\n"

    # 5. Save assistant reply & emit sources
    reply_content = "".join(full_reply)
    if reply_content:
        save_message(conv_id, "assistant", reply_content, db)

    yield f"data: [SOURCES_JSON] {json.dumps(sources)}\n\n"
    yield "data: [DONE]\n\n"


# ─── Distillation + cleanup ───────────────────────────────────────────────────

def _distill_single_session(conv: TutorConversation, db: Session) -> bool:
    llm = _get_llm()
    messages = (
        db.query(TutorMessage)
        .filter(TutorMessage.conversation_id == conv.id)
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    if not messages:
        conv.distilled_summary = "(No messages — session was empty)"
        conv.distilled_at = datetime.utcnow()
        db.commit()
        return True

    dialogue = "\n".join(f"{m.role.upper()}: {m.content[:400]}" for m in messages)

    if not llm:
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
        response = llm.invoke(prompt)
        summary = response.content.strip()
    except Exception as exc:
        logger.error("[Tutor] Distillation Groq error conv=%s: %s", conv.id, exc)
        return False

    conv.distilled_summary = summary
    conv.distilled_at = datetime.utcnow()
    db.query(TutorMessage).filter(TutorMessage.conversation_id == conv.id).delete()
    db.commit()
    logger.info("[Tutor] Distilled session %s → %d chars summary", conv.id, len(summary))
    return True


def _distill_expired_for_user(user_id: int, db: Session) -> int:
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
    msgs = _get_messages(conv_id, db)
    return [
        {
            "role":       m.role,
            "content":   m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]
