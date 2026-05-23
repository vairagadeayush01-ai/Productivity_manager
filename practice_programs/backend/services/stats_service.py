from datetime import date, timedelta
from sqlalchemy import func
from database import LearningEntry

def calculate_streak(db, user_id: int) -> int:
    """Calculates the consecutive daily learning streak."""
    dates = (
        db.query(func.date(LearningEntry.created_at))
        .filter(LearningEntry.user_id == user_id)
        .distinct()
        .order_by(func.date(LearningEntry.created_at).desc())
        .all()
    )
    dates = [d[0] for d in dates]
    if not dates:
        return 0
    
    streak = 0
    # SQLite func.date returns strings in format YYYY-MM-DD
    check_date = date.today()
    for d_str in dates:
        # Convert string to date object if necessary
        if isinstance(d_str, str):
            from datetime import datetime
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
        else:
            d = d_str
            
        if d == check_date or d == check_date - timedelta(days=1):
            streak += 1
            check_date = d
        else:
            break
    return streak

def get_top_topics(entries, limit: int = 10) -> list[str]:
    """Extract top topics from a list of LearningEntry objects or tuples."""
    topic_counts = {}
    for entry in entries:
        topics_str = entry.topics if hasattr(entry, 'topics') else entry[0]
        if not topics_str:
            continue
        for t in topics_str.split(", "):
            t = t.strip()
            if t:
                topic_counts[t] = topic_counts.get(t, 0) + 1
    return [t for t, c in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:limit]]
