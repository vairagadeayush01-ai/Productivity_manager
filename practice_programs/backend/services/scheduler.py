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
from services import quiz_service, spaced_repetition, weekly_report, notifier, youtube_service, summarizer
from routes.ingest import _save


QUIZ_HOUR   = int(os.getenv("QUIZ_HOUR", 20))    # 8 PM default
QUIZ_MINUTE = int(os.getenv("QUIZ_MINUTE", 30))  # 30 mins default (8:30 PM)


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


def _batch_summarize_job():
    print("[Scheduler] Running batch YouTube summarizer...")
    db = SessionLocal()
    try:
        from database import LearningEntry
        import json
        unsummarized = db.query(LearningEntry).filter(
            LearningEntry.source_type == "youtube",
            (LearningEntry.summary == None) | (LearningEntry.summary == "")
        ).all()
        
        if not unsummarized:
            print("[Scheduler] No unsummarized videos found.")
            return

        success_count = 0
        for entry in unsummarized:
            try:
                # Extract video ID from URL
                video_id = youtube_service.extract_video_id(entry.source_url)
                if not video_id:
                    continue
                
                print(f"[Scheduler] Fetching transcript for {entry.title}...")
                transcript = youtube_service.get_transcript(video_id)
                entry.raw_content = transcript[:2000]
                
                print(f"[Scheduler] Summarizing {entry.title}...")
                result = summarizer.summarize_transcript(transcript, entry.title)
                
                # _save handles ChromaDB and spaced repetition updates
                _save(db, "youtube", entry.title, entry.source_url, transcript, result)
                
                # We need to delete the original empty entry since _save creates a new one, 
                # OR we could just update the existing one. Since _save makes a new one:
                db.delete(entry)
                db.commit()
                
                success_count += 1
            except Exception as e:
                print(f"[Scheduler] Failed to summarize {entry.title}: {e}")
                
        if success_count > 0:
            notifier.notify_quiz_ready(success_count) # Reuse the notification or make a new one, we can just print for now
            print(f"[Scheduler] Successfully summarized {success_count} videos.")
            
    except Exception as e:
        print(f"[Scheduler] Batch summarize job failed: {e}")
    finally:
        db.close()


def _daily_github_job():
    """Daily GitHub sync background job."""
    print("[Scheduler] Running daily GitHub sync...")
    db = SessionLocal()
    try:
        from routes.Auto_fetch import _store
        from services.git_hub_today import fetch_today_activity
        data = fetch_today_activity()
        if data["total_commits"] == 0 and not data["new_repos"]:
            print("[Scheduler] No GitHub activity today.")
            return
        title = f"GitHub — {data['total_commits']} commit(s) in {len(data['repos_touched'])} repo(s)"
        _store(db, "github", title, data["summary_text"], f"https://github.com/{data['username']}")
        print("[Scheduler] GitHub activity saved successfully.")
    except Exception as e:
        print(f"[Scheduler] Daily GitHub job failed: {e}")
    finally:
        db.close()


def _daily_leetcode_job():
    """Daily LeetCode sync background job."""
    print("[Scheduler] Running daily LeetCode sync...")
    db = SessionLocal()
    try:
        from routes.Auto_fetch import _store
        from services.leetcode_today import fetch_today_submissions
        data = fetch_today_submissions()
        if data["total_solved"] == 0:
            print("[Scheduler] No LeetCode problems solved today.")
            return
        title = f"LeetCode — {data['total_solved']} problem(s) solved"
        _store(db, "leetcode", title, data["summary_text"], f"https://leetcode.com/{data['username']}")
        print("[Scheduler] LeetCode activity saved successfully.")
    except Exception as e:
        print(f"[Scheduler] Daily LeetCode job failed: {e}")
    finally:
        db.close()


def _daily_diary_job():
    """Generates the daily diary entry at the end of the day."""
    print("[Scheduler] Generating daily diary...")
    db = SessionLocal()
    try:
        from routes.diary import generate_diary_for_date
        from datetime import date
        today_str = date.today().isoformat()
        generate_diary_for_date(db, today_str)
        print("[Scheduler] Daily diary generated successfully.")
    except Exception as e:
        print(f"[Scheduler] Daily diary job failed: {e}")
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

    # Batch summarizer daily at 7:00 PM (19:00)
    scheduler.add_job(
        _batch_summarize_job,
        CronTrigger(hour=19, minute=0),
        id="batch_summarize", replace_existing=True
    )

    # Daily GitHub sync at 11:30 PM (23:30)
    scheduler.add_job(
        _daily_github_job,
        CronTrigger(hour=23, minute=30),
        id="daily_github", replace_existing=True
    )

    # Daily LeetCode sync at 11:30 PM (23:30)
    scheduler.add_job(
        _daily_leetcode_job,
        CronTrigger(hour=23, minute=30),
        id="daily_leetcode", replace_existing=True
    )
    
    # Daily diary at 11:45 PM (23:45)
    scheduler.add_job(
        _daily_diary_job,
        CronTrigger(hour=23, minute=45),
        id="daily_diary", replace_existing=True
    )

    scheduler.start()
    print(f"[Scheduler] Started — batch summarize at 19:00, github/leetcode at 23:30, daily quiz at {QUIZ_HOUR:02d}:{QUIZ_MINUTE:02d}, spaced rep at 09:00, weekly report Sundays 20:00")
    return scheduler