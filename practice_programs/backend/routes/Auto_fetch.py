import logging
import os
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from core.limiter import limiter
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import User, get_db
from services import entry_store
from services.git_hub_today import fetch_today_activity
from services.leetcode_today import fetch_today_submissions
from services.summarizer import summarize_transcript

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/fetch", tags=["auto-fetch"])


async def _store_from_activity(
    db: Session, user_id: int, source_type: str, title: str, raw_text: str, url: str = ""
):
    try:
        result = summarize_transcript(raw_text, title)
    except Exception as e:
        raise HTTPException(502, f"Groq error: {e}")
    return entry_store.save_entry(
        db,
        user_id,
        source_type,
        title,
        url,
        raw_text,
        result,
        dedupe_same_title_today=True,
    )


@router.post("/github")
@limiter.limit("10/minute")
async def fetch_github(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = await fetch_today_activity()
    except ValueError as e:
        raise HTTPException(422, str(e))
    if data["total_commits"] == 0 and not data["new_repos"]:
        return {"message": "No GitHub activity today.", "entry": None}
    title = f"GitHub — {data['total_commits']} commit(s) in {len(data['repos_touched'])} repo(s)"
    entry = await _store_from_activity(
        db,
        current_user.id,
        "github",
        title,
        data["summary_text"],
        f"https://github.com/{data['username']}",
    )
    return {
        "message": "GitHub activity saved.",
        "total_commits": data["total_commits"],
        "repos": data["repos_touched"],
        "entry": entry,
    }


@router.post("/leetcode")
@limiter.limit("10/minute")
async def fetch_leetcode(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = await fetch_today_submissions()
    except ValueError as e:
        raise HTTPException(422, str(e))
    if data["total_solved"] == 0:
        return {"message": "No LeetCode problems solved today.", "entry": None}
    title = f"LeetCode — {data['total_solved']} problem(s) solved"
    entry = await _store_from_activity(
        db,
        current_user.id,
        "leetcode",
        title,
        data["summary_text"],
        f"https://leetcode.com/{data['username']}",
    )
    return {
        "message": "LeetCode activity saved.",
        "total_solved": data["total_solved"],
        "problems": data["problems"],
        "entry": entry,
    }


@router.post("/all-today")
@limiter.limit("5/minute")
async def fetch_all_today(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = {}
    uid = current_user.id

    try:
        data = await fetch_today_activity()
        if data["total_commits"] == 0 and not data["new_repos"]:
            results["github"] = {"status": "skipped", "message": "No GitHub activity today."}
        else:
            title = f"GitHub — {data['total_commits']} commit(s) in {len(data['repos_touched'])} repo(s)"
            entry = await _store_from_activity(
                db, uid, "github", title, data["summary_text"], f"https://github.com/{data['username']}"
            )
            results["github"] = {"status": "ok", "message": "GitHub activity saved.", "entry": entry}
    except ValueError as e:
        results["github"] = {"status": "skipped", "message": str(e)}
    except Exception as e:
        logger.exception("GitHub fetch failed")
        results["github"] = {"status": "error", "message": str(e)}

    try:
        data = await fetch_today_submissions()
        if data["total_solved"] == 0:
            results["leetcode"] = {"status": "skipped", "message": "No LeetCode problems solved today."}
        else:
            title = f"LeetCode — {data['total_solved']} problem(s) solved"
            entry = await _store_from_activity(
                db, uid, "leetcode", title, data["summary_text"], f"https://leetcode.com/{data['username']}"
            )
            results["leetcode"] = {"status": "ok", "message": "LeetCode activity saved.", "entry": entry}
    except ValueError as e:
        results["leetcode"] = {"status": "skipped", "message": str(e)}
    except Exception as e:
        logger.exception("LeetCode fetch failed")
        results["leetcode"] = {"status": "error", "message": str(e)}

    from services.scheduler import _batch_summarize_job

    background_tasks.add_task(_batch_summarize_job, uid)

    return {"fetched_at": date.today().isoformat(), "results": results}


@router.get("/status")
async def fetch_status():
    return {
        "github_configured": bool(os.getenv("GITHUB_USERNAME")),
        "github_token_set": bool(os.getenv("GITHUB_TOKEN")),
        "leetcode_configured": bool(os.getenv("LEETCODE_USERNAME")),
    }
