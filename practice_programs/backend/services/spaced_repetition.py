"""
Spaced repetition using Ebbinghaus forgetting curve.
Correct answer → interval doubles (1→2→4→8→16→30 days max)
Wrong answer   → interval resets to 1 day
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from database import TopicReview


def record_topic_seen(db: Session, topic: str):
    topic = topic.strip().lower()
    if not topic:
        return
    existing = db.query(TopicReview).filter(TopicReview.topic == topic).first()
    if not existing:
        db.add(TopicReview(topic=topic, last_reviewed=date.today(), interval_days=1))
        db.commit()


def update_after_quiz(db: Session, topic: str, correct: bool):
    topic = topic.strip().lower()
    row   = db.query(TopicReview).filter(TopicReview.topic == topic).first()
    if not row:
        row = TopicReview(topic=topic, last_reviewed=date.today(), interval_days=1)
        db.add(row)
    if correct:
        row.times_correct  += 1
        row.interval_days   = min(row.interval_days * 2, 30)
    else:
        row.times_incorrect += 1
        row.interval_days   = 1
    row.last_reviewed = date.today()
    db.commit()


def get_due_topics(db: Session) -> list[dict]:
    today  = date.today()
    result = []
    for row in db.query(TopicReview).all():
        due_date     = row.last_reviewed + timedelta(days=row.interval_days)
        days_overdue = (today - due_date).days
        if days_overdue >= 0:
            result.append({
                "topic":           row.topic,
                "last_reviewed":   row.last_reviewed.isoformat(),
                "interval_days":   row.interval_days,
                "days_overdue":    days_overdue,
                "times_correct":   row.times_correct,
                "times_incorrect": row.times_incorrect,
            })
    return sorted(result, key=lambda x: x["days_overdue"], reverse=True)


def get_all_topics(db: Session) -> list[dict]:
    today  = date.today()
    result = []
    for row in db.query(TopicReview).order_by(TopicReview.last_reviewed.desc()).all():
        due_date   = row.last_reviewed + timedelta(days=row.interval_days)
        days_until = (due_date - today).days
        result.append({
            "topic":           row.topic,
            "last_reviewed":   row.last_reviewed.isoformat(),
            "interval_days":   row.interval_days,
            "due_in_days":     days_until,
            "status":          "overdue" if days_until < 0 else "due today" if days_until == 0 else "upcoming",
            "times_correct":   row.times_correct,
            "times_incorrect": row.times_incorrect,
        })
    return result


def get_topic_performance(db: Session) -> float:
    """Calculate overall performance score (0.0 to 1.0) based on quiz results.
    Returns: 0.0 = all wrong, 1.0 = all correct"""
    all_topics = db.query(TopicReview).all()
    if not all_topics:
        return 0.5
    
    total_correct = sum(t.times_correct for t in all_topics)
    total_attempted = sum(t.times_correct + t.times_incorrect for t in all_topics)
    
    if total_attempted == 0:
        return 0.5
    return total_correct / total_attempted