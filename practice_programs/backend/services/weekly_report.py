import json
import os
from datetime import date, datetime, timedelta

from groq import Groq
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import LearningEntry, QuizResult
from services.stats_service import get_top_topics

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"


def generate_weekly_report(db: Session, user_id: int) -> dict:
    week_ago = date.today() - timedelta(days=7)
    week_start = datetime.combine(week_ago, datetime.min.time())
    entries = (
        db.query(LearningEntry)
        .filter(LearningEntry.user_id == user_id, LearningEntry.created_at >= week_start)
        .all()
    )
    results = (
        db.query(QuizResult)
        .filter(QuizResult.user_id == user_id, QuizResult.attempted_at >= week_start)
        .all()
    )

    if not entries:
        return {"message": "No activity this week.", "stats": {}, "report": {}}

    yt = sum(1 for e in entries if e.source_type == "youtube")
    lc = sum(1 for e in entries if e.source_type == "leetcode")
    gh = sum(1 for e in entries if e.source_type == "github")
    mn = sum(1 for e in entries if e.source_type in ("manual", "paste"))
    rd = sum(1 for e in entries if e.source_type in ("pdf", "webpage"))

    top_topics = get_top_topics(entries, limit=8)

    total_q = len(results)
    correct = sum(1 for r in results if r.is_correct)
    accuracy = round(correct / total_q * 100) if total_q else 0
    active_days = len(set(e.created_at.date() for e in entries if e.created_at))

    stats = {
        "total_entries": len(entries),
        "youtube": yt,
        "leetcode": lc,
        "github": gh,
        "notes": mn,
        "reading": rd,
        "active_days": active_days,
        "quiz_accuracy": accuracy,
        "quiz_total": total_q,
        "top_topics": top_topics,
    }

    summaries = "\n".join(
        f"- [{e.source_type}] {e.title}: {(e.summary or '')[:150]}" for e in entries[:20]
    )

    prompt = f"""You are a personal learning coach. Write a weekly report card for this student.

Week stats:
- Videos: {yt}, LeetCode: {lc}, GitHub: {gh}, Notes/Reading: {mn+rd}
- Active days: {active_days}/7
- Quiz accuracy: {accuracy}% ({correct}/{total_q})
- Top topics: {', '.join(top_topics[:5])}

What they studied:
{summaries}

Write a motivating report card. Return ONLY valid JSON (no markdown):
{{
  "overall": "2-3 sentence overall summary",
  "strong_areas": "what they covered well",
  "needs_attention": "topics to revisit",
  "next_week": "1-2 specific suggestions for next week"
}}"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=800,
        )
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        report = json.loads(text.strip())
    except Exception:
        report = {
            "overall": "Could not generate report.",
            "strong_areas": "",
            "needs_attention": "",
            "next_week": "",
        }

    return {"stats": stats, "report": report, "date": date.today().isoformat()}
