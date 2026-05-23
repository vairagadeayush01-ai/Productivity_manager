import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from core.limiter import limiter
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import LearningEntry, User, get_db
from services import entry_store
from services.leetcode_today import get_problem_detail
from services.summarizer import summarize_manual_log, summarize_transcript
from services.youtube_service import extract_video_id, get_transcript, get_video_title

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ingest", tags=["ingest"])


class YouTubeRequest(BaseModel):
    url: str = Field(..., min_length=1)


class YouTubeTrackingRequest(BaseModel):
    videoId: str
    title: str
    channel: str
    duration: str
    thumbnail: str
    isEducational: bool
    confidence: int
    watchTime: int
    completion: int
    firstSeen: str
    lastWatched: str
    rewatchCount: int


class ManualLogRequest(BaseModel):
    note: str = Field(..., min_length=1)


class LeetCodeRequest(BaseModel):
    url: str = Field(..., min_length=1)
    outcome: str = Field(..., min_length=1)
    notes: str = ""


@router.post("/youtube")
@limiter.limit("15/minute")
async def ingest_youtube(
    request: Request,
    req: YouTubeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL.")
    try:
        transcript = get_transcript(video_id)
    except ValueError as e:
        logger.warning("Transcript failed for %s: %s", req.url, e)
        raise HTTPException(422, str(e))
    title = await get_video_title(video_id)
    try:
        result = summarize_transcript(transcript, title)
    except Exception as e:
        raise HTTPException(502, f"Groq API error: {e}")
    return entry_store.save_entry(
        db, current_user.id, "youtube", title, req.url, transcript, result
    )


@router.post("/youtube/sync")
async def sync_youtube_tracking(
    req: YouTubeTrackingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    url = f"https://www.youtube.com/watch?v={req.videoId}"
    existing = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.source_url == url,
            LearningEntry.summary == None,
        )
        .first()
    )
    metadata_dict = req.model_dump()

    if existing:
        existing.metadata_json = json.dumps(metadata_dict)
        db.commit()
        return {"status": "updated", "id": existing.id}

    summarized = (
        db.query(LearningEntry)
        .filter(LearningEntry.user_id == current_user.id, LearningEntry.source_url == url)
        .first()
    )
    if summarized:
        summarized.metadata_json = json.dumps(metadata_dict)
        db.commit()
        return {"status": "updated_existing", "id": summarized.id}

    entry = LearningEntry(
        user_id=current_user.id,
        source_type="youtube",
        title=req.title,
        source_url=url,
        raw_content="",
        metadata_json=json.dumps(metadata_dict),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"status": "created_for_batch", "id": entry.id}


@router.post("/log")
@limiter.limit("20/minute")
async def ingest_log(
    request: Request,
    req: ManualLogRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = req.note.strip()
    if not note:
        raise HTTPException(400, "Note cannot be empty.")
    try:
        result = summarize_manual_log(note)
    except Exception as e:
        raise HTTPException(502, f"Groq API error: {e}")
    summary = result.get("summary", note)
    return entry_store.save_entry(
        db, current_user.id, "manual", summary[:80], "", note, result
    )


@router.post("/leetcode")
@limiter.limit("15/minute")
async def ingest_leetcode(
    request: Request,
    req: LeetCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slug = req.url.rstrip("/").split("/")[-1]
    if not slug:
        raise HTTPException(400, "Invalid LeetCode URL.")

    detail = await get_problem_detail(slug)
    title = slug.replace("-", " ").title()
    difficulty = detail.get("difficulty", "Unknown")
    tags = detail.get("tags", [])

    raw_parts = [
        f"LeetCode problem: {title}",
        f"Difficulty: {difficulty}",
        f"Outcome: {req.outcome}",
    ]
    if tags:
        raw_parts.append(f"Topics: {', '.join(tags)}")
    if req.notes:
        raw_parts.append(f"Notes: {req.notes}")
    raw_content = "\n".join(raw_parts)

    try:
        result = summarize_transcript(raw_content, title)
    except Exception as e:
        logger.warning("Groq summarization failed for LeetCode %s: %s", slug, e)
        result = {
            "summary": raw_content,
            "topics": ["leetcode"] + tags[:5],
            "key_concepts": [],
        }

    topics = list(dict.fromkeys(["leetcode"] + result.get("topics", []) + tags[:5]))
    result["topics"] = topics

    return entry_store.save_entry(
        db, current_user.id, "leetcode", title, req.url, raw_content, result
    )
