from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import date

from database import get_db, LearningEntry
from services.git_hub_today import fetch_today_activity
from services.leetcode_today import fetch_today_submissions
from services.summarizer import summarize_transcript
from services import vector_store

router = APIRouter(prefix="/fetch", tags=["auto-fetch"])


def _store(db, source_type, title, raw_text, url=""):
    from services import spaced_repetition
    try:
        result = summarize_transcript(raw_text, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")

    summary  = result.get("summary", raw_text[:300])
    topics   = result.get("topics", [])
    concepts = result.get("key_concepts", [])
    embed    = f"Title: {title}\nSummary: {summary}\nTopics: {', '.join(topics)}"
    if concepts:
        embed += "\nKey concepts: " + ". ".join(f"{c['concept']}: {c['explanation']}" for c in concepts)

    entry = LearningEntry(source_type=source_type, title=title[:200],
                          source_url=url, raw_content=raw_text[:2000],
                          summary=summary, topics=", ".join(topics))
    db.add(entry); db.commit(); db.refresh(entry)

    chroma_id = str(entry.id)
    vector_store.add_entry(chroma_id, embed, {
        "source_type": source_type, "title": title[:200],
        "url": url, "topics": ", ".join(topics),
        "date": date.today().isoformat()
    })
    entry.chroma_id = chroma_id; db.commit()

    for t in topics:
        spaced_repetition.record_topic_seen(db, t)

    return {"id": entry.id, "title": title, "summary": summary,
            "topics": topics, "source_type": source_type,
            "created_at": entry.created_at.isoformat()}


@router.post("/github")
async def fetch_github(db: Session = Depends(get_db)):
    try:
        data = fetch_today_activity()
    except ValueError as e:
        raise HTTPException(422, str(e))
    if data["total_commits"] == 0 and not data["new_repos"]:
        return {"message": "No GitHub activity today.", "entry": None}
    title = f"GitHub — {data['total_commits']} commit(s) in {len(data['repos_touched'])} repo(s)"
    entry = _store(db, "github", title, data["summary_text"], f"https://github.com/{data['username']}")
    return {"message": "GitHub activity saved.", "total_commits": data["total_commits"],
            "repos": data["repos_touched"], "entry": entry}


@router.post("/leetcode")
async def fetch_leetcode(db: Session = Depends(get_db)):
    try:
        data = fetch_today_submissions()
    except ValueError as e:
        raise HTTPException(422, str(e))
    if data["total_solved"] == 0:
        return {"message": "No LeetCode problems solved today.", "entry": None}
    title = f"LeetCode — {data['total_solved']} problem(s) solved"
    entry = _store(db, "leetcode", title, data["summary_text"], f"https://leetcode.com/{data['username']}")
    return {"message": "LeetCode activity saved.", "total_solved": data["total_solved"],
            "problems": data["problems"], "entry": entry}


@router.get("/status")
async def fetch_status():
    import os
    return {
        "github_configured":   bool(os.getenv("GITHUB_USERNAME")),
        "github_token_set":    bool(os.getenv("GITHUB_TOKEN")),
        "leetcode_configured": bool(os.getenv("LEETCODE_USERNAME")),
    }