"""
routes/github.py — GitHub intelligence endpoints.

GET  /github/sync        — trigger manual sync, fetch today's commits + diffs
GET  /github/commits     — paginated list of stored GitHub entries
GET  /github/analytics   — aggregate stats (lines, repos, change types)
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.deps import get_current_user
from core.encryption import decrypt
from database import LearningEntry, User, get_db
from services.git_hub_today import fetch_today_activity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/github", tags=["github"])


def _get_pat(user: User) -> str:
    """Decrypt PAT from user profile. Returns '' if not connected."""
    if not user.github_pat_enc:
        return ""
    try:
        return decrypt(user.github_pat_enc)
    except Exception as exc:
        logger.warning("Could not decrypt GitHub PAT for user %s: %s", user.id, exc)
        return ""


@router.get("/sync")
async def sync_github(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger manual GitHub sync. Fetches today's commits with diffs,
    runs AI analysis, stores as LearningEntry rows.
    """
    pat = _get_pat(current_user)
    username = current_user.github_username or ""

    try:
        activity = await fetch_today_activity(pat=pat, username=username)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    commits = activity.get("commits", [])
    if not commits:
        return {
            "synced": 0,
            "message": "No commits today.",
            "date": activity["date"],
        }

    synced = 0
    for commit in commits:
        sha      = commit.get("sha", "")
        repo     = commit.get("repo", "")
        msg      = commit.get("message", "")
        ai       = commit.get("ai_analysis") or {}
        diff_data = commit.get("parsed_diff") or {}
        patch    = commit.get("patch_text", "")

        # Dedup: skip if this commit SHA already stored
        if sha:
            existing = db.query(LearningEntry).filter(
                LearningEntry.user_id == current_user.id,
                LearningEntry.source_url == sha,
                LearningEntry.source_type == "github",
            ).first()
            if existing:
                continue

        # Build topics from patterns + languages
        patterns  = ai.get("patterns", [])
        languages = diff_data.get("languages", [])
        change_type = ai.get("change_type") or diff_data.get("primary_change_type") or "feature"
        topics_list = list(dict.fromkeys(patterns + languages + [change_type]))  # dedup, preserve order
        topics_str  = json.dumps(topics_list[:8])

        summary = ai.get("semantic_summary") or msg

        entry = LearningEntry(
            user_id    = current_user.id,
            source_type= "github",
            title      = f"[{repo}] {msg[:100]}",
            source_url = sha or "",
            raw_content= patch[:5000] if patch else msg,
            summary    = summary,
            topics     = topics_str,
            metadata_json = json.dumps({
                "repo": repo,
                "sha": sha,
                "change_type": change_type,
                "impact": ai.get("impact", "unknown"),
                "lines_added": diff_data.get("total_additions", 0),
                "lines_deleted": diff_data.get("total_deletions", 0),
                "languages": languages,
                "file_count": diff_data.get("file_count", 0),
            }),
            created_at = datetime.utcnow(),
        )
        db.add(entry)
        synced += 1

    db.commit()
    logger.info("[GitHub] Synced %d commits for user_id=%s", synced, current_user.id)

    return {
        "synced":        synced,
        "total_commits": activity["total_commits"],
        "repos_touched": activity["repos_touched"],
        "date":          activity["date"],
        "message":       f"Synced {synced} new commits.",
    }


@router.get("/commits")
def list_commits(
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated list of stored GitHub commit entries."""
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.source_type == "github",
        )
        .order_by(LearningEntry.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    total = db.query(LearningEntry).filter(
        LearningEntry.user_id == current_user.id,
        LearningEntry.source_type == "github",
    ).count()

    results = []
    for e in entries:
        meta = {}
        try:
            meta = json.loads(e.metadata_json) if e.metadata_json else {}
        except Exception:
            pass

        results.append({
            "id":          e.id,
            "title":       e.title,
            "summary":     e.summary,
            "topics":      json.loads(e.topics) if e.topics else [],
            "sha":         e.source_url,
            "repo":        meta.get("repo", ""),
            "change_type": meta.get("change_type", ""),
            "impact":      meta.get("impact", ""),
            "lines_added": meta.get("lines_added", 0),
            "lines_deleted": meta.get("lines_deleted", 0),
            "languages":   meta.get("languages", []),
            "created_at":  e.created_at.isoformat() if e.created_at else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "commits": results}


@router.get("/analytics")
def github_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate stats across all stored GitHub commits."""
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.source_type == "github",
        )
        .all()
    )

    if not entries:
        return {
            "total_commits": 0,
            "repos": [],
            "total_lines_added": 0,
            "total_lines_deleted": 0,
            "change_types": {},
            "languages": {},
            "top_patterns": [],
        }

    total_add = total_del = 0
    repos: dict[str, int] = {}
    change_types: dict[str, int] = {}
    languages: dict[str, int] = {}
    pattern_counts: dict[str, int] = {}

    for e in entries:
        meta = {}
        try:
            meta = json.loads(e.metadata_json) if e.metadata_json else {}
        except Exception:
            pass

        total_add += meta.get("lines_added", 0)
        total_del += meta.get("lines_deleted", 0)

        repo = meta.get("repo", "unknown")
        repos[repo] = repos.get(repo, 0) + 1

        ct = meta.get("change_type", "unknown")
        change_types[ct] = change_types.get(ct, 0) + 1

        for lang in (meta.get("languages") or []):
            languages[lang] = languages.get(lang, 0) + 1

        try:
            topics = json.loads(e.topics) if e.topics else []
        except Exception:
            topics = []
        for t in topics:
            pattern_counts[t] = pattern_counts.get(t, 0) + 1

    top_repos = sorted(repos.items(), key=lambda x: x[1], reverse=True)[:10]
    top_patterns = sorted(pattern_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_commits":     len(entries),
        "repos":             [{"name": r, "commits": c} for r, c in top_repos],
        "total_lines_added": total_add,
        "total_lines_deleted": total_del,
        "change_types":      dict(sorted(change_types.items(), key=lambda x: x[1], reverse=True)),
        "languages":         dict(sorted(languages.items(), key=lambda x: x[1], reverse=True)),
        "top_patterns":      [{"pattern": p, "count": c} for p, c in top_patterns],
    }
