"""
sync_queue.py — Async processor for the ActivitySyncQueue table.

Responsibilities:
  1. Receive a validated batch from the /api/v1/activity/sync endpoint
  2. Deduplicate against existing queue rows using dedupe_key
  3. Insert accepted items into activity_sync_queue
  4. Launch background AI processing (summarize + embed → LearningEntry)
  5. Mark queue rows as done/failed after processing

AI processing is intentionally async so the HTTP response returns fast.
The extension gets an immediate acknowledgement; AI work happens in the background.

Error handling:
  - SQLAlchemy IntegrityError on dedupe_key collision → treat as "skipped"
  - Groq failures → mark queue row failed with error_message, do NOT crash
  - Vector store failures → log and continue (entry still saved to SQL)
"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import ActivitySyncQueue, LearningEntry
from services import entry_store
from services.summarizer import summarize_transcript

logger = logging.getLogger(__name__)


# ─── YouTube processing ───────────────────────────────────────────────────────

def _build_youtube_summary_fallback(payload: dict) -> dict:
    """
    Builds a minimal summary dict when Groq is unavailable or transcript is empty.
    Always returns a usable result — never raises.
    """
    title = payload.get("title", "Unknown video")
    channel = payload.get("channel_name", "Unknown channel")
    pct = payload.get("completion_pct", 0)
    return {
        "summary": f"Watched '{title}' by {channel} ({pct}% completed).",
        "topics": ["youtube", "video"],
        "key_concepts": [],
    }


def _process_youtube(db: Session, user_id: int, payload: dict) -> Optional[int]:
    """
    Converts a youtube_watch queue payload into a LearningEntry.
    Returns the new entry ID or None on failure.

    Steps:
      1. Skip if completion < 30% (not enough content to learn from)
      2. Try AI summarisation if transcript available, fall back to metadata
      3. Save entry + vector embed via entry_store
    """
    completion_pct = payload.get("completion_pct", 0)
    watch_duration = payload.get("watch_duration", 0)
    if watch_duration < 20:
        logger.info(
            "[SyncQueue] YouTube skipped — watch_duration %s sec < 20 sec threshold. video_id=%s",
            watch_duration,
            payload.get("video_id"),
        )
        return None

    video_id = payload.get("video_id", "")
    title = payload.get("title", "Unknown video")
    channel = payload.get("channel_name", "")
    transcript = payload.get("transcript", "").strip()
    source_url = f"https://www.youtube.com/watch?v={video_id}"

    # Build text for AI summarisation
    if transcript and len(transcript) > 100:
        ai_input = transcript
    else:
        # No usable transcript — use metadata as content
        ai_input = (
            f"Educational YouTube video: '{title}' by {channel}. "
            f"Watch completion: {completion_pct}%."
        )

    try:
        summary_result = summarize_transcript(ai_input, title)
        # Quality guard: reject trivially short summaries
        if len(summary_result.get("summary", "")) < 50:
            logger.warning(
                "[SyncQueue] Groq returned short summary for YouTube %s — using fallback.", video_id
            )
            summary_result = _build_youtube_summary_fallback(payload)
    except Exception as exc:
        logger.warning(
            "[SyncQueue] Groq failed for YouTube %s: %s — using fallback.", video_id, exc
        )
        summary_result = _build_youtube_summary_fallback(payload)

    # Build metadata for the entry
    chroma_extra = {
        "video_id": video_id,
        "channel_name": channel,
        "completion_pct": str(completion_pct),
        "watch_duration": str(payload.get("watch_duration", 0)),
    }

    result = entry_store.save_entry(
        db=db,
        user_id=user_id,
        source_type="youtube",
        title=title[:200],
        source_url=source_url,
        raw_content=transcript[:4000] if transcript else ai_input[:4000],
        summary_result=summary_result,
        dedupe_same_title_today=False,
        chroma_extra=chroma_extra,
    )
    return result.get("id")


# ─── LeetCode processing ──────────────────────────────────────────────────────

def _build_leetcode_summary_fallback(payload: dict) -> dict:
    slug = payload.get("problem_slug", "unknown")
    difficulty = payload.get("difficulty", "unknown")
    lang = payload.get("language", "unknown")
    return {
        "summary": f"Solved LeetCode '{slug}' ({difficulty}) in {lang}.",
        "topics": ["leetcode", difficulty.lower(), slug.replace("-", " ")],
        "key_concepts": [],
    }


def _process_leetcode(db: Session, user_id: int, payload: dict) -> Optional[int]:
    """
    Converts a leetcode_solve queue payload into a LearningEntry.
    Returns the new entry ID or None on failure.

    Steps:
      1. Build a structured prompt from problem metadata + solution code
      2. AI analysis: DS/Algo pattern, complexity, edge cases
      3. Save entry + vector embed
    """
    slug = payload.get("problem_slug", "")
    title = payload.get("title") or slug.replace("-", " ").title()
    difficulty = payload.get("difficulty", "unknown")
    language = payload.get("language", "unknown")
    solution_code = payload.get("solution_code", "")
    runtime_ms = payload.get("runtime_ms")
    memory_mb = payload.get("memory_mb")

    source_url = f"https://leetcode.com/problems/{slug}/"

    # Build a rich text for Groq to analyse
    ai_parts = [
        f"LeetCode Problem: {title}",
        f"Difficulty: {difficulty}",
        f"Language: {language}",
    ]
    if runtime_ms:
        ai_parts.append(f"Runtime: {runtime_ms}ms")
    if memory_mb:
        ai_parts.append(f"Memory: {memory_mb}MB")
    if solution_code:
        truncated_code = solution_code[:3000]  # guard against massive pastes
        ai_parts.append(f"\nAccepted Solution:\n```{language}\n{truncated_code}\n```")

    ai_input = "\n".join(ai_parts)

    try:
        summary_result = summarize_transcript(ai_input, title)
        if len(summary_result.get("summary", "")) < 50:
            logger.warning(
                "[SyncQueue] Short summary for LeetCode %s — using fallback.", slug
            )
            summary_result = _build_leetcode_summary_fallback(payload)
    except Exception as exc:
        logger.warning(
            "[SyncQueue] Groq failed for LeetCode %s: %s — using fallback.", slug, exc
        )
        summary_result = _build_leetcode_summary_fallback(payload)

    chroma_extra = {
        "problem_slug": slug,
        "difficulty": difficulty,
        "language": language,
    }

    result = entry_store.save_entry(
        db=db,
        user_id=user_id,
        source_type="leetcode",
        title=title[:200],
        source_url=source_url,
        raw_content=ai_input[:4000],
        summary_result=summary_result,
        dedupe_same_title_today=False,
        chroma_extra=chroma_extra,
    )
    return result.get("id")


# ─── Queue row management ─────────────────────────────────────────────────────

def _mark_done(db: Session, queue_row: ActivitySyncQueue, entry_id: Optional[int]) -> None:
    queue_row.status = "done"
    queue_row.processed_at = datetime.utcnow()
    queue_row.last_attempt_at = datetime.utcnow()
    db.commit()
    logger.debug("[SyncQueue] Queue row %s marked done. entry_id=%s", queue_row.id, entry_id)


def _mark_failed(db: Session, queue_row: ActivitySyncQueue, error: str) -> None:
    queue_row.status = "failed"
    queue_row.error_message = error[:1000]
    queue_row.last_attempt_at = datetime.utcnow()
    db.commit()
    logger.warning("[SyncQueue] Queue row %s failed: %s", queue_row.id, error)


# ─── Public API ───────────────────────────────────────────────────────────────

class ActivityResult:
    """Result of processing a single activity from the batch."""
    def __init__(self, dedupe_key: str, status: str, entry_id: Optional[int] = None, error: Optional[str] = None):
        self.dedupe_key = dedupe_key
        self.status = status      # "synced" | "skipped" | "failed"
        self.entry_id = entry_id
        self.error = error

    def to_dict(self) -> dict:
        d = {"dedupe_key": self.dedupe_key, "status": self.status}
        if self.entry_id:
            d["entry_id"] = self.entry_id
        return d


def process_batch(
    db: Session,
    user_id: int,
    device_id: str,
    activities: list[dict],
) -> list[ActivityResult]:
    """
    Process a batch of activity items from the extension.

    For each item:
      1. Check dedupe_key against activity_sync_queue — skip if already exists
      2. Insert queue row immediately (gives us the UNIQUE lock)
      3. Process (AI summarise + LearningEntry) — can fail independently
      4. Mark queue row done/failed based on outcome
      5. Return status per item

    The caller (route handler) returns HTTP 200 with the results list.
    Processing failures do NOT cause HTTP errors — they're per-item statuses.
    """
    results: list[ActivityResult] = []
    synced = 0
    skipped = 0
    failed = 0

    for activity in activities:
        dedupe_key = activity.get("dedupe_key", "")
        activity_type = activity.get("activity_type", "")
        payload = activity.get("payload", {})
        timestamp_str = activity.get("timestamp", "")

        if not dedupe_key or not activity_type:
            results.append(ActivityResult(dedupe_key, "failed", error="Missing dedupe_key or activity_type"))
            failed += 1
            continue

        # Early validation: reject youtube_watch with insufficient watch time BEFORE
        # consuming the dedupe key. This prevents a premature sync (watch_duration=0)
        # from blocking all future legitimate syncs for the same video.
        if activity_type == "youtube_watch":
            watch_duration = payload.get("watch_duration", 0)
            if watch_duration < 20:
                logger.info(
                    "[SyncQueue] Early-reject youtube_watch — watch_duration %ss < 20s threshold. video_id=%s",
                    watch_duration,
                    payload.get("video_id", "unknown"),
                )
                results.append(ActivityResult(dedupe_key, "skipped", error="watch_duration below threshold"))
                skipped += 1
                continue


        # 1. Try to insert queue row — UNIQUE constraint handles deduplication
        queue_row = ActivitySyncQueue(
            user_id=user_id,
            device_id=device_id,
            activity_type=activity_type,
            payload=json.dumps(payload),
            dedupe_key=dedupe_key,
            status="processing",
            last_attempt_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )

        try:
            db.add(queue_row)
            db.flush()  # write but don't commit yet — allows IntegrityError to surface
        except IntegrityError:
            db.rollback()
            logger.debug("[SyncQueue] Duplicate dedupe_key skipped: %s", dedupe_key[:16])
            results.append(ActivityResult(dedupe_key, "skipped"))
            skipped += 1
            continue
        except Exception as exc:
            db.rollback()
            logger.error("[SyncQueue] DB error inserting queue row: %s", exc)
            results.append(ActivityResult(dedupe_key, "failed", error=str(exc)))
            failed += 1
            continue

        db.commit()
        db.refresh(queue_row)

        # 2. Process the activity (AI + LearningEntry)
        try:
            entry_id: Optional[int] = None
            if activity_type == "youtube_watch":
                entry_id = _process_youtube(db, user_id, payload)
            elif activity_type == "leetcode_solve":
                entry_id = _process_leetcode(db, user_id, payload)
            else:
                raise ValueError(f"Unknown activity_type: {activity_type!r}")

            _mark_done(db, queue_row, entry_id)
            results.append(ActivityResult(dedupe_key, "synced", entry_id=entry_id))
            synced += 1

        except Exception as exc:
            error_msg = str(exc)
            logger.exception(
                "[SyncQueue] Processing failed for %s key=%s: %s",
                activity_type,
                dedupe_key[:16],
                error_msg,
            )
            _mark_failed(db, queue_row, error_msg)
            results.append(ActivityResult(dedupe_key, "failed", error=error_msg))
            failed += 1

    logger.info(
        "[SyncQueue] Batch complete — synced=%s skipped=%s failed=%s",
        synced, skipped, failed
    )
    return results
