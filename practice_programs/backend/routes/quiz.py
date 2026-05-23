from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from core.limiter import limiter
from sqlalchemy.orm import Session

from core.deps import get_current_user
from database import LearningEntry, QuizResult, User, get_db
from services import quiz_service, spaced_repetition, vector_store
from utils.datetime_helpers import today_start_end

router = APIRouter(prefix="/quiz", tags=["quiz"])


class AnswerRequest(BaseModel):
    question: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    user_answer: str
    correct_answer: str


@router.get("/recent")
@limiter.limit("10/minute")
async def get_recent_quiz(
    request: Request,
    difficulty: str = Query("medium", enum=["easy", "medium", "hard"]),
    n: int = Query(20, ge=5, le=50),
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    start = datetime.combine(today - timedelta(days=days), datetime.min.time())
    end = datetime.combine(today, datetime.max.time())
    entries = (
        db.query(LearningEntry)
        .filter(
            LearningEntry.user_id == current_user.id,
            LearningEntry.created_at >= start,
            LearningEntry.created_at <= end,
        )
        .all()
    )

    if not entries:
        raise HTTPException(
            404,
            f"No entries logged in the past {days} days. Add something first!",
        )

    entry_dicts = [
        {
            "source_type": e.source_type,
            "title": e.title,
            "summary": e.summary,
            "topics": e.topics,
        }
        for e in entries
    ]
    questions = quiz_service.generate_quiz(entry_dicts, n_questions=n, difficulty=difficulty)

    if not questions:
        raise HTTPException(502, "Could not generate quiz. Check your Groq API key and try again.")

    return {
        "date": today.isoformat(),
        "difficulty": difficulty,
        "questions": questions,
        "total": len(questions),
        "entries_used": len(entries),
    }


@router.get("/review/{topic}")
@limiter.limit("10/minute")
async def get_topic_review_quiz(
    request: Request,
    topic: str,
    difficulty: str = Query("medium", enum=["easy", "medium", "hard"]),
    n: int = Query(10, ge=3, le=30),
    current_user: User = Depends(get_current_user),
):
    results = vector_store.search(query=topic, n_results=8, user_id=current_user.id)
    context = "\n".join(r["document"] for r in results)

    if not context:
        raise HTTPException(404, f"No notes found for topic: {topic}")

    questions = quiz_service.generate_topic_quiz(
        topic, context, n_questions=n, difficulty=difficulty
    )
    if not questions:
        raise HTTPException(502, "Could not generate quiz.")

    return {
        "topic": topic,
        "difficulty": difficulty,
        "questions": questions,
        "total": len(questions),
    }


@router.post("/answer")
async def submit_answer(
    req: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_correct = req.user_answer.strip().lower() == req.correct_answer.strip().lower()

    result = QuizResult(
        user_id=current_user.id,
        question=req.question,
        topic=req.topic,
        user_answer=req.user_answer,
        correct_answer=req.correct_answer,
        is_correct=is_correct,
    )
    db.add(result)
    db.commit()

    spaced_repetition.update_after_quiz(db, current_user.id, req.topic, is_correct)

    return {"is_correct": is_correct, "correct_answer": req.correct_answer}


@router.get("/due")
async def get_due_topics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    due = spaced_repetition.get_due_topics(db, current_user.id)
    return {"due_count": len(due), "topics": due}


@router.get("/performance")
async def get_quiz_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = db.query(QuizResult).filter(QuizResult.user_id == current_user.id).all()
    if not results:
        return {"topics": [], "overall": {"total": 0, "correct": 0, "pct": 0}}

    topic_stats: dict = {}
    for r in results:
        t = r.topic or "General"
        if t not in topic_stats:
            topic_stats[t] = {"topic": t, "total": 0, "correct": 0}
        topic_stats[t]["total"] += 1
        topic_stats[t]["correct"] += 1 if r.is_correct else 0

    topics_list = []
    for t, s in topic_stats.items():
        pct = round(s["correct"] / s["total"] * 100) if s["total"] > 0 else 0
        level = "strong" if pct >= 80 else "intermediate" if pct >= 50 else "weak"
        topics_list.append({**s, "pct": pct, "level": level})

    topics_list.sort(key=lambda x: x["pct"])

    total_q = sum(s["total"] for s in topic_stats.values())
    total_ok = sum(s["correct"] for s in topic_stats.values())
    return {
        "topics": topics_list,
        "overall": {
            "total": total_q,
            "correct": total_ok,
            "pct": round(total_ok / total_q * 100) if total_q else 0,
        },
    }
