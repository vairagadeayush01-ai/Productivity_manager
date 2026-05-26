from datetime import date as date_type, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import LearningEntry, User, get_db
from services import vector_store, stats_service, entry_store
from utils.datetime_helpers import today_start_end

router = APIRouter(prefix="/search", tags=["search"])

# Valid source types for filter validation
_SOURCE_TYPES = {"youtube", "leetcode", "github", "manual", "paste", "pdf", "webpage"}


@router.get("/")
async def search_entries(
    q: str = Query(..., min_length=1),
    n: int = Query(5, ge=1, le=30),
    source_type: Optional[str] = Query(None, description="Filter by source: youtube, leetcode, github, manual, pdf, webpage"),
    current_user: User = Depends(get_current_user),
):
    """Semantic vector search across all learning entries."""
    try:
        results = vector_store.search(query=q, n_results=n * 2, user_id=current_user.id)
        if not results:
            return {"query": q, "results": [], "message": "Nothing found yet."}

        # Apply source_type post-filter if requested
        if source_type and source_type in _SOURCE_TYPES:
            results = [r for r in results if r["metadata"].get("source_type") == source_type]

        results = results[:n]

        return {
            "query": q,
            "results": [
                {
                    "id": r["id"],
                    "title": r["metadata"].get("title", ""),
                    "source_type": r["metadata"].get("source_type", ""),
                    "topics": r["metadata"].get("topics", ""),
                    "date": r["metadata"].get("date", ""),
                    "summary": r["document"][:300] if r.get("document") else "",
                    "relevance_score": round(1 - r.get("distance", 0), 3),
                }
                for r in results
            ],
        }
    except Exception as e:
        logger.error(f"Search error for user {current_user.id}: {e}")
        return {"query": q, "results": [], "error": "Search failed. Please try again."}



@router.get("/today")
async def get_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all entries created today."""
    today = date_type.today()
    start, end = today_start_end()
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.created_at >= start,
            LearningEntry.created_at <= end,
        )
        .order_by(LearningEntry.created_at.desc())
        .all()
    )
    return {
        "date": today.isoformat(),
        "count": len(entries),
        "entries": [
            {
                "id": e.id,
                "source_type": e.source_type,
                "title": e.title,
                "summary": e.summary,
                "topics": e.topics.split(", ") if e.topics else [],
                "source_url": e.source_url,
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ],
    }


@router.get("/history")
async def get_history(
    skip: int = 0,
    limit: int = 50,
    source_type: Optional[str] = Query(None, description="Filter: youtube, leetcode, github, manual, pdf, webpage"),
    start_date: Optional[str] = Query(None, description="ISO date string YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="ISO date string YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Paginated history of all learning entries with optional filters:
    - source_type: filter by content source
    - start_date / end_date: filter by date range (YYYY-MM-DD)
    """
    q = db.query(LearningEntry).filter(LearningEntry.user_id == current_user.id)

    # Source type filter
    if source_type and source_type in _SOURCE_TYPES:
        q = q.filter(LearningEntry.source_type == source_type)

    # Date range filters
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            q = q.filter(LearningEntry.created_at >= start_dt)
        except ValueError:
            pass  # Silently ignore malformed dates

    if end_date:
        try:
            # Include the full end day (up to 23:59:59)
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
            q = q.filter(LearningEntry.created_at <= end_dt)
        except ValueError:
            pass

    total = q.count()
    entries = q.order_by(LearningEntry.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "entries": [
            {
                "id": e.id,
                "source_type": e.source_type,
                "title": e.title,
                "summary": e.summary,
                "topics": e.topics.split(", ") if e.topics else [],
                "source_url": e.source_url,
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ],
    }


@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns aggregated stats."""
    row = (
        db.query(
            func.count(LearningEntry.id).label("total"),
            func.sum(case((LearningEntry.source_type == "youtube", 1), else_=0)).label("youtube"),
            func.sum(case((LearningEntry.source_type == "leetcode", 1), else_=0)).label("leetcode"),
            func.sum(case((LearningEntry.source_type == "github", 1), else_=0)).label("github"),
            func.sum(
                case((LearningEntry.source_type.in_(["manual", "paste", "webpage", "pdf"]), 1), else_=0)
            ).label("manual"),
        )
        .filter(LearningEntry.user_id == current_user.id)
        .one()
    )

    streak_count = stats_service.calculate_streak(db, current_user.id)

    entries = db.query(LearningEntry.topics).filter(LearningEntry.user_id == current_user.id).all()
    top_topics = stats_service.get_top_topics(entries)

    return {
        "total_entries": row.total or 0,
        "youtube": int(row.youtube or 0),
        "leetcode": int(row.leetcode or 0),
        "github": int(row.github or 0),
        "manual": int(row.manual or 0),
        "vectors_stored": vector_store.collection_count(),
        "streak": streak_count,
        "top_topics": top_topics,
    }


@router.post("/reindex")
async def reindex_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-index all entries for current user (for migration from old unindexed entries)."""
    entries = db.query(LearningEntry).filter(LearningEntry.user_id == current_user.id).all()

    reindexed_count = 0
    for entry in entries:
        if not entry.summary:
            continue
        topics = entry.topics.split(", ") if entry.topics else []
        embed_text = f"Title: {entry.title}\nSummary: {entry.summary}\nTopics: {', '.join(topics)}"

        chroma_id = f"{current_user.id}_{entry.id}"
        metadata = {
            "user_id": str(current_user.id),
            "source_type": entry.source_type,
            "title": entry.title[:200],
            "url": entry.source_url or "",
            "topics": entry.topics,
            "date": date_type.today().isoformat(),
        }

        try:
            vector_store.collection.delete(ids=[chroma_id])
        except Exception:
            pass

        vector_store.add_entry(chroma_id, embed_text, metadata)
        entry.chroma_id = chroma_id
        reindexed_count += 1

    db.commit()

    return {
        "status": "completed",
        "reindexed_count": reindexed_count,
        "message": f"Re-indexed {reindexed_count} entries for search"
    }

