"""
services/rag_service.py — Retrieval-Augmented Generation pipeline.

Core flow:
  1. Semantic search: vector_store.search(query, user_id) → top-k entries
  2. Context assembly: format retrieved entries into a concise prompt block
  3. Groq call: stream answer with SOURCE citation markers
  4. Parse citations: return structured citation list alongside streamed text

Citation format in the streamed answer:
  [SOURCE: Title of entry]
  Frontend parses these markers and renders them as clickable cards.

Key design rules:
  - Max 6 retrieved documents × ~400 chars = ~2400 chars context
  - System prompt forbids hallucination: "only answer from sources"
  - If nothing retrieved: honest "I don't have notes on that" reply
  - All source types supported: youtube, leetcode, github, manual, paste, pdf
"""
import json
import logging
import os
from collections.abc import Iterator

from services import vector_store

logger = logging.getLogger(__name__)

_GROQ_MODEL = "llama-3.3-70b-versatile"
_MAX_SOURCES = 6
_MAX_CHARS_PER_SOURCE = 450
_MAX_CONTEXT_CHARS = 2800


def _get_groq():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None
    try:
        from groq import Groq
        return Groq(api_key=api_key)
    except Exception as exc:
        logger.warning("Groq client init failed: %s", exc)
        return None


# ─── Source type labels ───────────────────────────────────────────────────────

_SOURCE_LABELS = {
    "youtube":  "📺 YouTube",
    "leetcode": "💻 LeetCode",
    "github":   "🔧 GitHub",
    "manual":   "📝 Note",
    "paste":    "📋 Paste",
    "pdf":      "📄 PDF",
    "webpage":  "🌐 Web",
}


def _label(source_type: str) -> str:
    return _SOURCE_LABELS.get(source_type, "📌 Entry")


# ─── Context assembly ─────────────────────────────────────────────────────────

def retrieve_context(query: str, user_id: int, n: int = _MAX_SOURCES) -> tuple[list[dict], str]:
    """
    Retrieve top-n relevant entries from ChromaDB for this user.

    Returns:
      sources: list of dicts with id, title, source_type, date, summary
      context_text: formatted block for Groq prompt
    """
    raw = vector_store.search(query=query, n_results=n, user_id=user_id)
    if not raw:
        return [], ""

    sources = []
    context_parts = []
    total_chars = 0

    for r in raw:
        meta = r.get("metadata", {})
        doc  = r.get("document", "")
        title       = meta.get("title", "Untitled")
        source_type = meta.get("source_type", "manual")
        date        = meta.get("date", "")
        url         = meta.get("url", "")

        # Truncate to budget
        snippet = doc[:_MAX_CHARS_PER_SOURCE]
        entry_text = (
            f"[{_label(source_type)}] {title}"
            + (f" ({date})" if date else "")
            + f"\n{snippet}"
        )

        total_chars += len(entry_text)
        if total_chars > _MAX_CONTEXT_CHARS:
            break

        sources.append({
            "id":          r["id"],
            "title":       title,
            "source_type": source_type,
            "date":        date,
            "url":         url,
            "snippet":     snippet[:200],
        })
        context_parts.append(entry_text)

    return sources, "\n\n---\n\n".join(context_parts)


# ─── Single-turn RAG answer (streaming) ───────────────────────────────────────

def stream_rag_answer(query: str, user_id: int) -> Iterator[str]:
    """
    Retrieves context and streams a Groq answer as SSE-compatible text chunks.

    Yields strings ending in '\n\n' following SSE convention.
    Each chunk is prefixed with 'data: ' by the route layer.

    Citation markers [SOURCE: Title] appear inline in the streamed text.
    After the answer, yields a final JSON sources block:
      data: [SOURCES_JSON] {...}
    """
    groq = _get_groq()
    sources, context_text = retrieve_context(query, user_id)

    # ── No context case ─────────────────────────────────────────────────────
    if not context_text:
        msg = (
            "I don't have any notes on that topic yet. "
            "Add some YouTube lectures, LeetCode solutions, or GitHub commits first — "
            "then I can give you a grounded answer."
        )
        yield f"data: {msg}\n\n"
        yield "data: [DONE]\n\n"
        return

    if not groq:
        yield "data: AI unavailable — GROQ_API_KEY not set.\n\n"
        yield "data: [DONE]\n\n"
        return

    # ── System prompt ────────────────────────────────────────────────────────
    source_titles = "\n".join(f"- {s['title']}" for s in sources)
    system = f"""You are the user's personal AI learning assistant. You have access to their actual learning notes, code solutions, and study history.

RULES:
1. Answer ONLY based on the provided sources below.
2. When you reference a source, cite it inline like this: [SOURCE: Exact Title Here]
3. If the answer is not in the sources, say exactly: "I don't have notes on that specific topic yet."
4. Be concise and precise. Technical depth is appreciated.
5. Never fabricate facts, code, or citations.

AVAILABLE SOURCES:
{context_titles_block(sources)}"""

    # ── Groq streaming call ──────────────────────────────────────────────────
    try:
        stream = groq.chat.completions.create(
            model=_GROQ_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": query},
            ],
            temperature=0.3,
            max_tokens=600,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield f"data: {delta}\n\n"

    except Exception as exc:
        logger.error("RAG Groq stream failed: %s", exc)
        yield f"data: [Error: {exc}]\n\n"

    # ── Emit sources JSON block ──────────────────────────────────────────────
    yield f"data: [SOURCES_JSON] {json.dumps(sources)}\n\n"
    yield "data: [DONE]\n\n"


def context_titles_block(sources: list[dict]) -> str:
    """Format source list for system prompt."""
    lines = []
    for s in sources:
        lines.append(
            f"• [{s['source_type'].upper()}] {s['title']}"
            + (f" ({s['date']})" if s.get("date") else "")
        )
    return "\n".join(lines)
