from datetime import date as date_type

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import LearningEntry, User, get_db
from services import vector_store
from utils.datetime_helpers import today_start_end

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/")
async def search_entries(
    q: str = Query(..., min_length=1),
    n: int = Query(5, ge=1, le=30),
    current_user: User = Depends(get_current_user),
):
    results = vector_store.search(query=q, n_results=n, user_id=current_user.id)
    if not results:
        return {"query": q, "results": [], "message": "Nothing found yet."}
    return {
        "query": q,
        "results": [
            {
                "id": r["id"],
                "title": r["metadata"].get("title", ""),
                "source_type": r["metadata"].get("source_type", ""),
                "topics": r["metadata"].get("topics", ""),
                "date": r["metadata"].get("date", ""),
                "summary": r["document"][:300],
                "relevance_score": round(1 - r["distance"], 3),
            }
            for r in results
        ],
    }


@router.get("/today")
async def get_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(LearningEntry).filter(LearningEntry.user_id == current_user.id)
    entries = q.order_by(LearningEntry.created_at.desc()).offset(skip).limit(limit).all()
    total = q.count()
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
    row = (
        db.query(
            func.count(LearningEntry.id).label("total"),
            func.sum(case((LearningEntry.source_type == "youtube", 1), else_=0)).label("youtube"),
            func.sum(case((LearningEntry.source_type == "leetcode", 1), else_=0)).label("leetcode"),
            func.sum(case((LearningEntry.source_type == "github", 1), else_=0)).label("github"),
            func.sum(
                case((LearningEntry.source_type.in_(["manual", "paste"]), 1), else_=0)
            ).label("manual"),
        )
        .filter(LearningEntry.user_id == current_user.id)
        .one()
    )

    return {
        "total_entries": row.total or 0,
        "youtube": int(row.youtube or 0),
        "leetcode": int(row.leetcode or 0),
        "github": int(row.github or 0),
        "manual": int(row.manual or 0),
        "vectors_stored": vector_store.collection_count(),
    }
