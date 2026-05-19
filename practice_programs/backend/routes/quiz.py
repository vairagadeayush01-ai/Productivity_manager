from fastapi import APIRouter, HTTPException, Depends
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
async def get_today_quiz(db: Session = Depends(get_db)):
    """Generates a quiz from today's learning entries."""
    today   = date.today()
    entries = db.query(LearningEntry).filter(
        LearningEntry.created_at >= today.isoformat()
    ).all()

    if not entries:
        raise HTTPException(404, "No entries logged today. Add something first!")

    entry_dicts = [
        {"source_type": e.source_type, "title": e.title,
         "summary": e.summary, "topics": e.topics}
        for e in entries
    ]
    questions = quiz_service.generate_quiz(entry_dicts, n_questions=7)

    if not questions:
        raise HTTPException(502, "Could not generate quiz. Try again.")

    return {"date": today.isoformat(), "questions": questions, "total": len(questions)}


@router.get("/review/{topic}")
async def get_topic_review_quiz(topic: str, db: Session = Depends(get_db)):
    """Generates a focused quiz on a specific topic for spaced repetition."""
    results = vector_store.search(query=topic, n_results=5)
    context = "\n".join(r["document"] for r in results)

    if not context:
        raise HTTPException(404, f"No notes found for topic: {topic}")

    questions = quiz_service.generate_topic_quiz(topic, context, n_questions=5)
    if not questions:
        raise HTTPException(502, "Could not generate quiz.")

    return {"topic": topic, "questions": questions, "total": len(questions)}


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