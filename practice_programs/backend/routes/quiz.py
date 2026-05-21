from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import date

from database import get_db, LearningEntry, QuizResult
from services import quiz_service, spaced_repetition, vector_store

router = APIRouter(prefix="/quiz", tags=["quiz"])


class AnswerRequest(BaseModel):
    question: str
    topic: str
    user_answer: str
    correct_answer: str


@router.get("/today")
async def get_today_quiz(
    difficulty: str = Query("medium", enum=["easy", "medium", "hard"]),
    n: int = Query(20, ge=5, le=50),
    db: Session = Depends(get_db)
):
    """Generates a quiz from today's learning entries.
    
    Query params:
    - difficulty: easy | medium | hard (default: medium)
    - n: number of questions (default: 20, min: 5, max: 50)
    """
    today   = date.today()
    entries = db.query(LearningEntry).filter(
        LearningEntry.created_at >= today.isoformat()
    ).all()

    if not entries:
        raise HTTPException(404, "No entries logged today. Add something first or sync your GitHub/LeetCode!")

    entry_dicts = [
        {"source_type": e.source_type, "title": e.title,
         "summary": e.summary, "topics": e.topics}
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
        "entries_used": len(entries)
    }


@router.get("/review/{topic}")
async def get_topic_review_quiz(
    topic: str,
    difficulty: str = Query("medium", enum=["easy", "medium", "hard"]),
    n: int = Query(10, ge=3, le=30),
    db: Session = Depends(get_db)
):
    """Generates a focused quiz on a specific topic for spaced repetition."""
    results = vector_store.search(query=topic, n_results=8)
    context = "\n".join(r["document"] for r in results)

    if not context:
        raise HTTPException(404, f"No notes found for topic: {topic}")

    questions = quiz_service.generate_topic_quiz(topic, context, n_questions=n, difficulty=difficulty)
    if not questions:
        raise HTTPException(502, "Could not generate quiz.")

    return {"topic": topic, "difficulty": difficulty, "questions": questions, "total": len(questions)}


@router.post("/answer")
async def submit_answer(req: AnswerRequest, db: Session = Depends(get_db)):
    """Records a quiz answer and updates spaced repetition."""
    is_correct = req.user_answer.strip().lower() == req.correct_answer.strip().lower()

    result = QuizResult(
        question=req.question, topic=req.topic,
        user_answer=req.user_answer, correct_answer=req.correct_answer,
        is_correct=is_correct
    )
    db.add(result); db.commit()

    # Update spaced repetition for this topic
    spaced_repetition.update_after_quiz(db, req.topic, is_correct)

    return {"is_correct": is_correct, "correct_answer": req.correct_answer}


@router.get("/due")
async def get_due_topics(db: Session = Depends(get_db)):
    """Returns topics due for spaced repetition review."""
    due = spaced_repetition.get_due_topics(db)
    return {"due_count": len(due), "topics": due}


@router.get("/performance")
async def get_quiz_performance(db: Session = Depends(get_db)):
    """Returns per-topic quiz performance to identify weak/strong areas."""
    results = db.query(QuizResult).all()
    if not results:
        return {"topics": [], "overall": {"total": 0, "correct": 0, "pct": 0}}

    topic_stats: dict = {}
    for r in results:
        t = r.topic or "General"
        if t not in topic_stats:
            topic_stats[t] = {"topic": t, "total": 0, "correct": 0}
        topic_stats[t]["total"]   += 1
        topic_stats[t]["correct"] += 1 if r.is_correct else 0

    topics_list = []
    for t, s in topic_stats.items():
        pct = round(s["correct"] / s["total"] * 100) if s["total"] > 0 else 0
        level = "strong" if pct >= 80 else "intermediate" if pct >= 50 else "weak"
        topics_list.append({**s, "pct": pct, "level": level})

    topics_list.sort(key=lambda x: x["pct"])

    total_q   = sum(s["total"] for s in topic_stats.values())
    total_ok  = sum(s["correct"] for s in topic_stats.values())
    return {
        "topics": topics_list,
        "overall": {
            "total": total_q,
            "correct": total_ok,
            "pct": round(total_ok / total_q * 100) if total_q else 0
        }
    }