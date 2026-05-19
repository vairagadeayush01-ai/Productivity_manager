from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import date

from database import get_db, LearningEntry
from services.youtube_service import extract_video_id, get_transcript, get_video_title
from services.summarizer import summarize_transcript, summarize_manual_log
from services import vector_store
from services import spaced_repetition

router = APIRouter(prefix="/ingest", tags=["ingest"])


class YouTubeRequest(BaseModel):
    url: str

class ManualLogRequest(BaseModel):
    note: str

class LeetCodeRequest(BaseModel):
    url: str
    outcome: str
    notes: str = ""


def _save(db, source_type, title, source_url, raw_content, summary_result):
    summary = summary_result.get("summary", "")
    topics  = summary_result.get("topics", [])
    concepts = summary_result.get("key_concepts", [])

    embed_text = f"Title: {title}\nSummary: {summary}\nTopics: {', '.join(topics)}"
    if concepts:
        embed_text += "\nKey concepts: " + ". ".join(f"{c['concept']}: {c['explanation']}" for c in concepts)

    entry = LearningEntry(
        source_type=source_type, title=title[:200],
        source_url=source_url, raw_content=raw_content[:2000],
        summary=summary, topics=", ".join(topics)
    )
    db.add(entry); db.commit(); db.refresh(entry)

    chroma_id = str(entry.id)
    vector_store.add_entry(chroma_id, embed_text, {
        "source_type": source_type, "title": title[:200],
        "url": source_url or "", "topics": ", ".join(topics),
        "date": date.today().isoformat()
    })
    entry.chroma_id = chroma_id; db.commit()

    # Record topics for spaced repetition
    for t in topics:
        spaced_repetition.record_topic_seen(db, t)

    return {"id": entry.id, "title": title, "summary": summary,
            "topics": topics, "source_type": source_type,
            "created_at": entry.created_at.isoformat()}


@router.post("/youtube")
async def ingest_youtube(req: YouTubeRequest, db: Session = Depends(get_db)):
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL.")
    try:
        transcript = get_transcript(video_id)
    except ValueError as e:
        raise HTTPException(422, str(e))
    title = get_video_title(video_id)
    try:
        result = summarize_transcript(transcript, title)
    except Exception as e:
        raise HTTPException(502, f"Groq API error: {e}")
    return _save(db, "youtube", title, req.url, transcript, result)


@router.post("/log")
async def ingest_log(req: ManualLogRequest, db: Session = Depends(get_db)):
    if not req.note.strip():
        raise HTTPException(400, "Note cannot be empty.")
    try:
        result = summarize_manual_log(req.note)
    except Exception as e:
        raise HTTPException(502, f"Groq API error: {e}")
    summary = result.get("summary", req.note)
    return _save(db, "manual", summary[:80], "", req.note, result)


@router.post("/leetcode")
async def ingest_leetcode(req: LeetCodeRequest, db: Session = Depends(get_db)):
    slug    = req.url.rstrip("/").split("/")[-1]
    title   = slug.replace("-", " ").title()
    note    = f"LeetCode: {title}. Outcome: {req.outcome}."
    if req.notes:
        note += f" Notes: {req.notes}"
    result  = {"summary": note, "topics": ["leetcode", slug], "key_concepts": []}
    return _save(db, "leetcode", title, req.url, req.notes, result)