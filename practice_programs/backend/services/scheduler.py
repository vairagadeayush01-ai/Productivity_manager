"""
scheduler.py — background job scheduler using APScheduler.
Jobs:
  1. Daily quiz notification   — every day at configured time (default 2:00 PM)
  2. Spaced repetition check   — every day at 9:00 AM
  3. Weekly report             — every Sunday at 8:00 PM
"""
import os
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from database import SessionLocal
from services import quiz_service, spaced_repetition, weekly_report, notifier


QUIZ_HOUR   = int(os.getenv("QUIZ_HOUR", 14))    # 2 PM default
QUIZ_MINUTE = int(os.getenv("QUIZ_MINUTE", 0))


def _daily_quiz_job():
    """Generates a quiz from today's entries and sends a Windows notification."""
    print("[Scheduler] Running daily quiz job...")
    db = SessionLocal()
    try:
        from database import LearningEntry
        from datetime import date
        today   = date.today()
        entries = db.query(LearningEntry).filter(
            LearningEntry.created_at >= today.isoformat()
        ).all()

        if not entries:
            print("[Scheduler] No entries today — skipping quiz notification.")
            return

        entry_dicts = [
            {"source_type": e.source_type, "title": e.title,
             "summary": e.summary, "topics": e.topics}
            for e in entries
        ]
        questions = quiz_service.generate_quiz(entry_dicts, n_questions=7)

        if questions:
            notifier.notify_quiz_ready(len(questions))
            print(f"[Scheduler] Quiz ready — {len(questions)} questions generated.")
        else:
            print("[Scheduler] Quiz generation returned no questions.")
    except Exception as e:
        print(f"[Scheduler] Daily quiz job failed: {e}")
    finally:
        db.close()


def _spaced_repetition_job():
    """Checks for overdue topics and sends a notification if any are due."""
    print("[Scheduler] Checking spaced repetition...")
    db = SessionLocal()
    try:
        due = spaced_repetition.get_due_topics(db)
        if due:
            topics = [d["topic"] for d in due[:5]]
            notifier.notify_spaced_repetition(topics)
            print(f"[Scheduler] {len(due)} topics due for review.")
        else:
            print("[Scheduler] No topics due today.")
    except Exception as e:
        print(f"[Scheduler] Spaced repetition job failed: {e}")
    finally:
        db.close()


def _weekly_report_job():
    """Generates weekly report and sends a notification."""
    print("[Scheduler] Generating weekly report...")
    db = SessionLocal()
    try:
        report = weekly_report.generate_weekly_report(db)
        if report.get("stats"):
            notifier.notify_weekly_report()
            print("[Scheduler] Weekly report generated.")
    except Exception as e:
        print(f"[Scheduler] Weekly report job failed: {e}")
    finally:
        db.close()


def start_scheduler():
    scheduler = BackgroundScheduler()

    # Daily quiz at configured time
    scheduler.add_job(
        _daily_quiz_job,
        CronTrigger(hour=QUIZ_HOUR, minute=QUIZ_MINUTE),
        id="daily_quiz", replace_existing=True
    )

    # Spaced repetition check every morning at 9 AM
    scheduler.add_job(
        _spaced_repetition_job,
        CronTrigger(hour=9, minute=0),
        id="spaced_repetition", replace_existing=True
    )

    # Weekly report every Sunday at 8 PM
    scheduler.add_job(
        _weekly_report_job,
        CronTrigger(day_of_week="sun", hour=20, minute=0),
        id="weekly_report", replace_existing=True
    )

    scheduler.start()
    print(f"[Scheduler] Started — daily quiz at {QUIZ_HOUR:02d}:{QUIZ_MINUTE:02d}, spaced rep at 09:00, weekly report Sundays 20:00")
    return scheduler