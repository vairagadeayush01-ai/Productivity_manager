"""
routes/activity.py — Batch activity sync endpoint for the Chrome extension.

POST /api/v1/activity/sync

This is the core offline-first sync endpoint. The extension:
  1. Queues activities locally in chrome.storage.local while offline
  2. Calls this endpoint in batches when online + authenticated
  3. Gets per-item status so it knows which items to remove from its local queue

Deduplication:
  The dedupe_key (sha256 fingerprint computed by the extension) prevents
  the same activity being processed twice even if the extension retries.
  The UNIQUE constraint on activity_sync_queue.dedupe_key is the source of truth.

Rate limiting:
  10 sync requests per minute — generous for a personal project but prevents runaway loops.

Auth:
  Standard JWT Bearer token. The extension sends its stored access token.
  401 → extension should attempt refresh and retry once.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from typing import Optional

from core.deps import get_current_user
from core.limiter import limiter
from database import User, get_db
from services import sync_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/activity", tags=["activity-sync"])


# ─── Request / Response schemas ───────────────────────────────────────────────

class ActivityItem(BaseModel):
    """A single activity item submitted by the extension."""
    dedupe_key: str = Field(..., min_length=16, max_length=64, description="sha256 fingerprint")
    activity_type: str = Field(..., pattern="^(youtube_watch|leetcode_solve)$")
    payload: dict = Field(..., description="Activity-specific data")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp of when activity occurred")

    @field_validator("payload")
    @classmethod
    def payload_must_not_be_empty(cls, v: dict) -> dict:
        if not v:
            raise ValueError("Payload cannot be empty")
        return v


class SyncBatchRequest(BaseModel):
    """
    Batch of activities from the extension's offline queue.
    device_id: ephemeral extension fingerprint (not tied to user account).
    """
    device_id: str = Field(..., min_length=1, max_length=100)
    activities: list[ActivityItem] = Field(..., min_length=1, max_length=100)


class ActivityResultItem(BaseModel):
    dedupe_key: str
    status: str           # "synced" | "skipped" | "failed"
    entry_id: Optional[int] = None


class SyncBatchResponse(BaseModel):
    synced: int
    skipped: int
    failed: int
    results: list[ActivityResultItem]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post(
    "/sync",
    response_model=SyncBatchResponse,
    summary="Batch sync from Chrome extension offline queue",
    description=(
        "Accepts a batch of offline-queued activities from the Chrome extension. "
        "Returns per-item status. Duplicate dedupe_keys are silently skipped. "
        "AI processing (summarisation + embedding) happens synchronously per item. "
        "HTTP 200 is returned even when individual items fail — check `results[].status`."
    ),
)
@limiter.limit("10/minute")
async def batch_sync_activity(
    request: Request,
    body: SyncBatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.info(
        "[ActivitySync] User %s syncing %s activities from device %s",
        current_user.id,
        len(body.activities),
        body.device_id[:16],
    )

    if not body.activities:
        raise HTTPException(400, "activities list cannot be empty")

    # Convert Pydantic models to plain dicts for the service layer
    activities_raw = [item.model_dump() for item in body.activities]

    results = sync_queue.process_batch(
        db=db,
        user_id=current_user.id,
        device_id=body.device_id,
        activities=activities_raw,
    )

    synced = sum(1 for r in results if r.status == "synced")
    skipped = sum(1 for r in results if r.status == "skipped")
    failed = sum(1 for r in results if r.status == "failed")

    return SyncBatchResponse(
        synced=synced,
        skipped=skipped,
        failed=failed,
        results=[
            ActivityResultItem(
                dedupe_key=r.dedupe_key,
                status=r.status,
                entry_id=r.entry_id,
            )
            for r in results
        ],
    )


@router.get(
    "/queue-stats",
    summary="Get extension sync queue statistics",
    description="Returns counts of pending/done/failed items for the current user.",
)
async def get_queue_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from database import ActivitySyncQueue
    from sqlalchemy import func

    stats = (
        db.query(ActivitySyncQueue.status, func.count(ActivitySyncQueue.id))
        .filter(ActivitySyncQueue.user_id == current_user.id)
        .group_by(ActivitySyncQueue.status)
        .all()
    )
    counts = {row[0]: row[1] for row in stats}
    return {
        "pending": counts.get("pending", 0),
        "processing": counts.get("processing", 0),
        "done": counts.get("done", 0),
        "failed": counts.get("failed", 0),
        "total": sum(counts.values()),
    }
