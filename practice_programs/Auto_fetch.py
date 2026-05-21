"""
auto_fetch.py — routes that pull data automatically from GitHub and LeetCode,
summarize with Gemini, and store the result just like any other learning entry.

POST /fetch/github   — fetches today's commits and stores them
POST /fetch/leetcode — fetches today's solved problems and stores them
GET  /fetch/status   — quick check: are GitHub + LeetCode configured?
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import date

from database import get_db, LearningEntry
from services.github_service import fetch_today_activity
from services.leetcode_service import fetch_today_submissions
from services.summarizer import summarize_transcript
from services import vector_store

router = APIRouter(prefix="/fetch", tags=["auto-fetch"])


def _store_entry(db, source_type, title, summary_result, raw_text, url=""):
    """Shared helper — saves to SQLite + ChromaDB."""
    summary  = summary_result.get("summary", raw_text[:300])
    topics   = summary_result.get("topics", [])
    concepts = summary_result.get("key_concepts", [])

    embed_text = f"Title: {title}\nSummary: {summary}\nTopics: {', '.join(topics)}"
    if concepts:
        embed_text += "\nKey concepts: " + ". ".join(
            f"{c['concept']}: {c['explanation']}" for c in concepts
        )

    entry = LearningEntry(
        source_type = source_type,
        title       = title[:200],
        source_url  = url,
        raw_content = raw_text[:2000],
        summary     = summary,
        topics      = ", ".join(topics),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    chroma_id = str(entry.id)
    vector_store.add_entry(
        entry_id = chroma_id,
        text     = embed_text,
        metadata = {
            "source_type": source_type,
            "title":  title[:200],
            "url":    url,
            "topics": ", ".join(topics),
            "date":   date.today().isoformat(),
        }
    )
    entry.chroma_id = chroma_id
    db.commit()

    return {
        "id":          entry.id,
        "title":       title,
        "summary":     summary,
        "topics":      topics,
        "source_type": source_type,
        "created_at":  entry.created_at.isoformat()
    }


@router.post("/github")
async def fetch_github(db: Session = Depends(get_db)):
    """
    Fetches today's GitHub commits + repo activity, summarizes with Gemini,
    and stores as a 'github' learning entry.
    """
    try:
        data = fetch_today_activity()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if data["total_commits"] == 0 and not data["new_repos"]:
        return {
            "message": "No GitHub activity found for today.",
            "date": data["date"],
            "entry": None
        }

    raw_text = data["summary_text"]
    title = f"GitHub — {data['total_commits']} commit(s) across {len(data['repos_touched'])} repo(s)"

    try:
        summary_result = summarize_transcript(raw_text, title)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {e}")

    entry = _store_entry(
        db          = db,
        source_type = "github",
        title       = title,
        summary_result = summary_result,
        raw_text    = raw_text,
        url         = f"https://github.com/{data['username']}"
    )

    return {
        "message":       "GitHub activity saved.",
        "date":          data["date"],
        "total_commits": data["total_commits"],
        "repos":         data["repos_touched"],
        "entry":         entry
    }


@router.post("/leetcode")
async def fetch_leetcode(db: Session = Depends(get_db)):
    """
    Fetches today's accepted LeetCode submissions, summarizes with Gemini,
    and stores as a 'leetcode' learning entry.
    """
    try:
        data = fetch_today_submissions()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if data["total_solved"] == 0:
        return {
            "message": "No LeetCode problems solved today.",
            "date": data["date"],
            "entry": None
        }

    raw_text = data["summary_text"]
    title    = f"LeetCode — {data['total_solved']} problem(s) solved"

    try:
        summary_result = summarize_transcript(raw_text, title)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini error: {e}")

    entry = _store_entry(
        db          = db,
        source_type = "leetcode",
        title       = title,
        summary_result = summary_result,
        raw_text    = raw_text,
        url         = f"https://leetcode.com/{data['username']}"
    )

    return {
        "message":      "LeetCode activity saved.",
        "date":         data["date"],
        "total_solved": data["total_solved"],
        "problems":     data["problems"],
        "entry":        entry
    }


@router.get("/status")
async def fetch_status():
    """Quick check — are GitHub and LeetCode usernames configured?"""
    import os
    return {
        "github_configured":   bool(os.getenv("GITHUB_USERNAME")),
        "github_token_set":    bool(os.getenv("GITHUB_TOKEN")),
        "leetcode_configured": bool(os.getenv("LEETCODE_USERNAME")),
    }