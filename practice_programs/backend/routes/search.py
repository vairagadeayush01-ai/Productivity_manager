from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from datetime import date as date_type, datetime, time
from database import get_db, LearningEntry
from services import vector_store

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/")
async def search_entries(q: str = Query(...), n: int = Query(5, ge=1, le=20)):
    results = vector_store.search(query=q, n_results=n)
    if not results:
        return {"query": q, "results": [], "message": "Nothing found yet."}
    return {"query": q, "results": [
        {"id": r["id"], "title": r["metadata"].get("title",""),
         "source_type": r["metadata"].get("source_type",""),
         "topics": r["metadata"].get("topics",""),
         "date": r["metadata"].get("date",""),
         "summary": r["document"][:300],
         "relevance_score": round(1 - r["distance"], 3)}
        for r in results
    ]}


@router.get("/today")
async def get_today(db: Session = Depends(get_db)):
    today   = date_type.today()
    today_start = datetime.combine(today, time.min)
    entries = db.query(LearningEntry).filter(
        LearningEntry.created_at >= today_start
    ).order_by(LearningEntry.created_at.desc()).all()
    return {"date": today.isoformat(), "count": len(entries), "entries": [
        {"id": e.id, "source_type": e.source_type, "title": e.title,
         "summary": e.summary, "topics": (e.topics.split(", ") if e.topics else []),
         "created_at": e.created_at.isoformat()}
        for e in entries
    ]}


@router.get("/history")
async def get_history(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    entries = db.query(LearningEntry).order_by(LearningEntry.created_at.desc()).offset(skip).limit(limit).all()
    total = db.query(LearningEntry).count()
    return {"total": total, "entries": [
        {"id": e.id, "source_type": e.source_type, "title": e.title,
         "summary": e.summary, "topics": (e.topics.split(", ") if e.topics else []),
         "created_at": e.created_at.isoformat()}
        for e in entries
    ]}


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    # Extract all unique topics from all entries
    entries = db.query(LearningEntry).all()
    all_topics_set = set()
    for entry in entries:
        if entry.topics:
            topics = [t.strip() for t in entry.topics.split(",") if t.strip()]
            all_topics_set.update(topics)
    all_topics_list = sorted(list(all_topics_set))
    
    return {
        "total_entries":  db.query(LearningEntry).count(),
        "youtube":        db.query(LearningEntry).filter(LearningEntry.source_type=="youtube").count(),
        "leetcode":       db.query(LearningEntry).filter(LearningEntry.source_type=="leetcode").count(),
        "github":         db.query(LearningEntry).filter(LearningEntry.source_type=="github").count(),
        "manual":         db.query(LearningEntry).filter(LearningEntry.source_type.in_(["manual","paste"])).count(),
        "vectors_stored": vector_store.collection_count(),
        "all_topics":     all_topics_list
    }