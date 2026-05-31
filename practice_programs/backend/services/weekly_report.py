"""
services/weekly_report.py — Weekly report with SSE-compatible streaming generator.

Two modes:
  1. generate_weekly_report()  — classic blocking call (kept for backward compat)
  2. stream_weekly_report()    — async generator that yields SSE events

SSE event protocol (consumed by useReportStream hook):
  event: stats        — JSON with activity counts, accuracy, topics
  event: chunk        — incremental AI text chunk (delta streaming)
  event: section      — signals a complete section boundary (overall/strong_areas/…)
  event: done         — signals completion, carries final parsed report JSON
  event: error        — signals a recoverable or fatal error

Section parsing strategy:
  The AI is prompted to wrap each section in XML-like tags:
    <overall>…</overall>
    <strong_areas>…</strong_areas>
    <needs_attention>…</needs_attention>
    <next_week>…</next_week>
  
  The StreamRenderer on the frontend parses these tags as they arrive,
  rendering each section progressively as it completes — no waiting for
  the full response.

  This avoids fragmented JSON (the old approach of JSON streaming was brittle
  because partial JSON is unparseable). Tags are simple and robust.

Fallback:
  If streaming fails mid-stream (Groq rate limit, network drop), the generator
  yields an error event with whatever sections were already parsed, then done.
  The frontend shows partial content rather than a blank error screen.
"""
import logging
import os
import re
from datetime import date, datetime, timedelta
from typing import AsyncGenerator

from sqlalchemy.orm import Session

from database import LearningEntry, QuizResult
from services.stats_service import get_top_topics
from core.llm import create_chat_completion

logger = logging.getLogger(__name__)

load_dotenv_needed = False
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─── Shared data-collection logic ─────────────────────────────────────────────

def _collect_report_data(db: Session, user_id: int) -> tuple[list, list, dict]:
    """
    Returns (entries, quiz_results, stats_dict).
    Centralised so both blocking and streaming paths use identical data.
    """
    week_ago = date.today() - timedelta(days=7)
    week_start = datetime.combine(week_ago, datetime.min.time())

    entries = (
        db.query(LearningEntry)
        .filter(LearningEntry.user_id == user_id, LearningEntry.created_at >= week_start)
        .order_by(LearningEntry.created_at.desc())
        .all()
    )
    results = (
        db.query(QuizResult)
        .filter(QuizResult.user_id == user_id, QuizResult.attempted_at >= week_start)
        .all()
    )

    if not entries:
        return entries, results, {}

    yt = sum(1 for e in entries if e.source_type == "youtube")
    lc = sum(1 for e in entries if e.source_type == "leetcode")
    gh = sum(1 for e in entries if e.source_type == "github")
    mn = sum(1 for e in entries if e.source_type in ("manual", "paste"))
    rd = sum(1 for e in entries if e.source_type in ("pdf", "webpage"))

    top_topics = get_top_topics(entries, limit=8)
    total_q = len(results)
    correct = sum(1 for r in results if r.is_correct)
    accuracy = round(correct / total_q * 100) if total_q else 0
    active_days = len(set(e.created_at.date() for e in entries if e.created_at))

    stats = {
        "total_entries": len(entries),
        "youtube": yt,
        "leetcode": lc,
        "github": gh,
        "notes": mn,
        "reading": rd,
        "active_days": active_days,
        "quiz_accuracy": accuracy,
        "quiz_total": total_q,
        "top_topics": top_topics,
    }
    return entries, results, stats


def _build_prompt(stats: dict, entries: list) -> str:
    """Build the AI prompt using section-tag format for reliable stream parsing."""
    summaries = "\n".join(
        f"- [{e.source_type}] {e.title}: {(e.summary or '')[:150]}"
        for e in entries[:20]
    )
    top = ", ".join(stats.get("top_topics", [])[:5]) or "none"
    yt, lc, gh = stats["youtube"], stats["leetcode"], stats["github"]
    mn_rd = stats["notes"] + stats["reading"]
    days = stats["active_days"]
    acc = stats["quiz_accuracy"]
    correct = round(acc * stats["quiz_total"] / 100) if stats["quiz_total"] else 0
    total_q = stats["quiz_total"]

    return f"""You are a personal learning coach. Write a weekly report card for this developer.

Week stats:
- Videos: {yt}, LeetCode: {lc}, GitHub commits: {gh}, Notes/Reading: {mn_rd}
- Active days: {days}/7
- Quiz accuracy: {acc}% ({correct}/{total_q})
- Top topics studied: {top}

What they studied this week:
{summaries}

Write a motivating, specific, personalised report card.
Use the student's actual topics and activities — do NOT give generic advice.

CRITICAL: Respond using EXACTLY this format with these XML tags, no other text:
<overall>
2-3 sentence overview of the week. Mention specific topics they studied.
</overall>
<strong_areas>
What they covered well this week. Be specific about topics and languages.
</strong_areas>
<needs_attention>
1-2 areas to revisit or go deeper on. Reference actual topics from their list.
</needs_attention>
<next_week>
1-2 concrete, actionable suggestions for next week based on what they studied.
</next_week>"""


def _parse_sections(text: str) -> dict:
    """Extract the four report sections from the tag-delimited AI response."""
    sections = {}
    for key in ("overall", "strong_areas", "needs_attention", "next_week"):
        match = re.search(rf"<{key}>(.*?)</{key}>", text, re.DOTALL)
        sections[key] = match.group(1).strip() if match else ""
    return sections


# ─── Blocking (legacy) path ───────────────────────────────────────────────────

def generate_weekly_report(db: Session, user_id: int) -> dict:
    """
    Original blocking implementation — kept for backward compat.
    Report.jsx will migrate to the streaming endpoint but this fallback remains.
    """
    entries, results, stats = _collect_report_data(db, user_id)
    if not entries:
        return {"message": "No activity this week.", "stats": {}, "report": {}}

    prompt = _build_prompt(stats, entries)
    try:
        response = create_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=900,
        )
        text = response.choices[0].message.content.strip()
        report = _parse_sections(text)
    except Exception as exc:
        logger.warning("Groq weekly report failed: %s", exc)
        report = {
            "overall": "Could not generate AI report. Check your GROQ_API_KEY.",
            "strong_areas": "",
            "needs_attention": "",
            "next_week": "",
        }

    return {"stats": stats, "report": report, "date": date.today().isoformat()}


# ─── Streaming path ───────────────────────────────────────────────────────────

import json as _json


def _sse(event: str, data: dict | str) -> str:
    """Format a single SSE message."""
    payload = _json.dumps(data) if isinstance(data, dict) else data
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_weekly_report(db: Session, user_id: int) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.

    Event sequence:
      1. stats event    — immediately after DB query (fast)
      2. chunk events   — one per Groq streaming delta
      3. section events — fired as each <tag>…</tag> closes
      4. done event     — final parsed report + date
      5. error event    — only on unrecoverable failure

    The frontend can render stats immediately, then progressively
    reveal each report section as its closing tag arrives.
    """
    # ── Step 1: Collect data ──────────────────────────────────────────────────
    try:
        entries, results, stats = _collect_report_data(db, user_id)
    except Exception as exc:
        logger.exception("Failed to collect report data: %s", exc)
        yield _sse("error", {"message": "Failed to load your data. Check backend logs."})
        return

    if not entries:
        yield _sse("stats", {})
        yield _sse("done", {
            "stats": {},
            "report": {},
            "date": date.today().isoformat(),
            "message": "No activity this week.",
        })
        return

    # ── Step 2: Emit stats immediately ───────────────────────────────────────
    yield _sse("stats", stats)

    # ── Step 3: Stream AI response ────────────────────────────────────────────
    prompt = _build_prompt(stats, entries)
    full_text = ""
    section_keys = ["overall", "strong_areas", "needs_attention", "next_week"]
    emitted_sections: set[str] = set()

    try:
        stream = create_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=900,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if not delta:
                continue

            full_text += delta

            # Emit raw chunk for progressive text rendering
            yield _sse("chunk", {"delta": delta})

            # Check if any section tag just closed in the accumulated buffer
            for key in section_keys:
                if key in emitted_sections:
                    continue
                close_tag = f"</{key}>"
                if close_tag in full_text:
                    match = re.search(rf"<{key}>(.*?)</{key}>", full_text, re.DOTALL)
                    if match:
                        content = match.group(1).strip()
                        yield _sse("section", {"key": key, "content": content})
                        emitted_sections.add(key)
                        logger.debug("[Report] Section emitted: %s (%d chars)", key, len(content))

    except Exception as exc:
        logger.warning("Groq streaming failed mid-stream: %s", exc)
        # Don't yield error — fall through to done with whatever we have
        # so partial content is shown rather than a blank screen
        yield _sse("error", {
            "message": f"AI stream interrupted: {exc}",
            "recoverable": True,
        })

    # ── Step 4: Parse final full text and emit done ───────────────────────────
    report = _parse_sections(full_text) if full_text else {
        "overall": "AI response was empty. Check GROQ_API_KEY and rate limits.",
        "strong_areas": "",
        "needs_attention": "",
        "next_week": "",
    }

    # Emit any sections that were missed (e.g. if stream ended before close tag)
    for key in section_keys:
        if key not in emitted_sections and report.get(key):
            yield _sse("section", {"key": key, "content": report[key]})

    yield _sse("done", {
        "stats": stats,
        "report": report,
        "date": date.today().isoformat(),
    })
    logger.info("[Report] Stream complete for user_id=%s. Sections: %s", user_id, list(emitted_sections))
