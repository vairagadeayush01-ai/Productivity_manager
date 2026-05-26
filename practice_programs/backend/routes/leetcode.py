"""
routes/leetcode.py — LeetCode intelligence endpoints.

POST /leetcode/analyze      — analyze a solution (given slug + code + language)
GET  /leetcode/submissions  — paginated list of stored LeetCode entries
GET  /leetcode/analytics    — DS/Algo pattern breakdown, difficulty distribution
"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import LearningEntry, User, get_db
from services.leetcode_today import (
    analyze_solution,
    get_problem_description,
    get_problem_detail,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/leetcode", tags=["leetcode"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    problem_slug: str = Field(..., min_length=1, max_length=200)
    solution_code: str = Field(..., min_length=1, max_length=20_000)
    language: str = Field(..., min_length=1, max_length=30)  # e.g. "python3", "java"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_leetcode_solution(
    body: AnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze a submitted LeetCode solution.
    Fetches problem details from LeetCode GraphQL, runs Groq AI analysis,
    stores result as a LearningEntry.
    Returns analysis dict + entry_id.
    """
    slug = body.problem_slug.strip().lower()

    # Fetch problem metadata from LeetCode
    detail, description = await _fetch_parallel(slug)

    problem_title = detail.get("title") or slug.replace("-", " ").title()
    difficulty    = detail.get("difficulty", "Unknown")
    tags          = detail.get("tags", [])

    # Run AI analysis
    analysis = await analyze_solution(
        problem_title=problem_title,
        difficulty=difficulty,
        tags=tags,
        description=description,
        solution_code=body.solution_code,
        language=body.language,
    )

    # Build topics
    topics_list = list(dict.fromkeys(
        filter(None, [
            analysis.get("pattern", ""),
            analysis.get("ds_used", ""),
            difficulty,
        ] + tags[:3])
    ))
    topics_str = json.dumps(topics_list[:8])

    # Store as LearningEntry
    entry = LearningEntry(
        user_id    = current_user.id,
        source_type= "leetcode",
        title      = f"{problem_title} [{difficulty}]",
        source_url = f"https://leetcode.com/problems/{slug}/",
        raw_content= body.solution_code[:8000],
        summary    = analysis.get("summary", ""),
        topics     = topics_str,
        metadata_json = json.dumps({
            "slug":             slug,
            "difficulty":       difficulty,
            "language":         body.language,
            "ds_used":          analysis.get("ds_used", ""),
            "pattern":          analysis.get("pattern", ""),
            "time_complexity":  analysis.get("time_complexity", ""),
            "space_complexity": analysis.get("space_complexity", ""),
            "optimization_tip": analysis.get("optimization_tip", ""),
            "edge_cases":       analysis.get("edge_cases_handled", []),
            "missed_edges":     analysis.get("missed_edges", []),
        }),
        created_at = datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    logger.info("[LeetCode] Analyzed '%s' for user_id=%s → entry_id=%s", slug, current_user.id, entry.id)

    return {
        "entry_id":      entry.id,
        "problem_title": problem_title,
        "difficulty":    difficulty,
        "language":      body.language,
        "analysis":      analysis,
    }


async def _fetch_parallel(slug: str) -> tuple[dict, str]:
    """Fetch detail + description concurrently."""
    import asyncio
    detail, desc = await asyncio.gather(
        get_problem_detail(slug),
        get_problem_description(slug),
        return_exceptions=True,
    )
    return (
        detail if isinstance(detail, dict) else {"difficulty": "Unknown", "tags": []},
        desc   if isinstance(desc, str)   else "",
    )


@router.get("/submissions")
def list_submissions(
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Paginated list of stored LeetCode submission entries."""
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.source_type == "leetcode",
        )
        .order_by(LearningEntry.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    total = db.query(LearningEntry).filter(
        LearningEntry.user_id == current_user.id,
        LearningEntry.source_type == "leetcode",
    ).count()

    results = []
    for e in entries:
        meta = {}
        try:
            meta = json.loads(e.metadata_json) if e.metadata_json else {}
        except Exception:
            pass

        results.append({
            "id":              e.id,
            "title":           e.title,
            "summary":         e.summary,
            "topics":          json.loads(e.topics) if e.topics else [],
            "slug":            meta.get("slug", ""),
            "difficulty":      meta.get("difficulty", ""),
            "language":        meta.get("language", ""),
            "pattern":         meta.get("pattern", ""),
            "ds_used":         meta.get("ds_used", ""),
            "time_complexity": meta.get("time_complexity", ""),
            "source_url":      e.source_url,
            "created_at":      e.created_at.isoformat() if e.created_at else None,
        })

    return {"total": total, "skip": skip, "limit": limit, "submissions": results}


@router.get("/analytics")
def leetcode_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate analytics: difficulty distribution, pattern breakdown, top tags."""
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.source_type == "leetcode",
        )
        .all()
    )

    if not entries:
        return {
            "total_solved": 0,
            "difficulty": {},
            "patterns": [],
            "ds_breakdown": [],
            "top_topics": [],
        }

    difficulty_counts: dict[str, int] = {}
    pattern_counts:    dict[str, int] = {}
    ds_counts:         dict[str, int] = {}
    topic_counts:      dict[str, int] = {}

    for e in entries:
        meta = {}
        try:
            meta = json.loads(e.metadata_json) if e.metadata_json else {}
        except Exception:
            pass

        # Difficulty from title "[Easy]" or metadata
        diff = meta.get("difficulty") or ""
        if not diff and e.title:
            for lvl in ["Easy", "Medium", "Hard"]:
                if f"[{lvl}]" in (e.title or ""):
                    diff = lvl
                    break
        if diff:
            difficulty_counts[diff] = difficulty_counts.get(diff, 0) + 1

        pat = meta.get("pattern", "")
        if pat:
            pattern_counts[pat] = pattern_counts.get(pat, 0) + 1

        ds = meta.get("ds_used", "")
        if ds:
            ds_counts[ds] = ds_counts.get(ds, 0) + 1

        try:
            topics = json.loads(e.topics) if e.topics else []
        except Exception:
            topics = []
        for t in topics:
            topic_counts[t] = topic_counts.get(t, 0) + 1

    return {
        "total_solved":  len(entries),
        "difficulty":    dict(sorted(difficulty_counts.items())),
        "patterns":      sorted(
            [{"pattern": k, "count": v} for k, v in pattern_counts.items()],
            key=lambda x: x["count"], reverse=True
        )[:10],
        "ds_breakdown":  sorted(
            [{"ds": k, "count": v} for k, v in ds_counts.items()],
            key=lambda x: x["count"], reverse=True
        )[:10],
        "top_topics":    sorted(
            [{"topic": k, "count": v} for k, v in topic_counts.items()],
            key=lambda x: x["count"], reverse=True
        )[:10],
    }
