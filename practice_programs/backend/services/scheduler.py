"""
scheduler.py — background jobs (per-user where applicable).
"""
import asyncio
import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import LearningEntry, SessionLocal, User
from services import entry_store, notifier, quiz_service, spaced_repetition, summarizer, weekly_report, youtube_service
from utils.datetime_helpers import today_start_end

logger = logging.getLogger(__name__)

QUIZ_HOUR = int(os.getenv("QUIZ_HOUR", 20))
QUIZ_MINUTE = int(os.getenv("QUIZ_MINUTE", 30))


def _all_user_ids(db) -> list[int]:
    return [u.id for u in db.query(User).all()]


def _daily_quiz_job():
    logger.info("Running daily quiz job...")
    db = SessionLocal()
    try:
        start, end = today_start_end()
        for user_id in _all_user_ids(db):
            entries = (
                db.query(LearningEntry)
                .filter(
                    LearningEntry.user_id == user_id,
                    LearningEntry.created_at >= start,
                    LearningEntry.created_at <= end,
                )
                .all()
            )
            if not entries:
                continue
            entry_dicts = [
                {
                    "source_type": e.source_type,
                    "title": e.title,
                    "summary": e.summary,
                    "topics": e.topics,
                }
                for e in entries
            ]
            questions = quiz_service.generate_quiz(entry_dicts, n_questions=7)
            if questions:
                notifier.notify_quiz_ready(len(questions))
                logger.info("Quiz ready for user %s — %d questions.", user_id, len(questions))
    except Exception:
        logger.exception("Daily quiz job failed")
    finally:
        db.close()


def _spaced_repetition_job():
    logger.info("Checking spaced repetition...")
    db = SessionLocal()
    try:
        for user_id in _all_user_ids(db):
            due = spaced_repetition.get_due_topics(db, user_id)
            if due:
                topics = [d["topic"] for d in due[:5]]
                notifier.notify_spaced_repetition(topics)
                logger.info("User %s: %d topics due.", user_id, len(due))
    except Exception:
        logger.exception("Spaced repetition job failed")
    finally:
        db.close()


def _weekly_report_job():
    logger.info("Generating weekly report...")
    db = SessionLocal()
    try:
        for user_id in _all_user_ids(db):
            report = weekly_report.generate_weekly_report(db, user_id)
            if report.get("stats"):
                notifier.notify_weekly_report()
                logger.info("Weekly report for user %s.", user_id)
    except Exception:
        logger.exception("Weekly report job failed")
    finally:
        db.close()


def _batch_summarize_job(user_id: int | None = None):
    """Summarize pending YouTube entries. If user_id set, only that user."""
    logger.info("Running batch YouTube summarizer (user_id=%s)...", user_id)
    db = SessionLocal()
    try:
        q = db.query(LearningEntry).filter(
            LearningEntry.source_type == "youtube",
            (LearningEntry.summary == None) | (LearningEntry.summary == ""),
        )
        if user_id is not None:
            q = q.filter(LearningEntry.user_id == user_id)
        unsummarized = q.all()

        if not unsummarized:
            logger.info("No unsummarized videos found.")
            return

        success_count = 0
        for entry in unsummarized:
            try:
                video_id = youtube_service.extract_video_id(entry.source_url)
                if not video_id:
                    continue
                transcript = youtube_service.get_transcript(video_id)
                result = summarizer.summarize_transcript(transcript, entry.title)
                entry_store.update_entry_from_summary(db, entry, transcript, result)
                success_count += 1
            except Exception:
                logger.exception("Failed to summarize %s", entry.title)

        if success_count > 0:
            notifier.notify_quiz_ready(success_count)
            logger.info("Summarized %d videos.", success_count)
    except Exception:
        logger.exception("Batch summarize job failed")
    finally:
        db.close()


def _daily_github_job():
    logger.info("Running daily GitHub sync...")
    db = SessionLocal()
    try:
        from services.git_hub_today import fetch_today_activity

        data = asyncio.run(fetch_today_activity())
        if data["total_commits"] == 0 and not data["new_repos"]:
            logger.info("No GitHub activity today.")
            return
        user_ids = _all_user_ids(db)
        if len(user_ids) > 1:
            logger.warning(
                "Skipping scheduled GitHub sync: multiple users with shared GITHUB_USERNAME. "
                "Use per-user manual sync from the dashboard."
            )
            return
        title = f"GitHub — {data['total_commits']} commit(s) in {len(data['repos_touched'])} repo(s)"
        result = summarizer.summarize_transcript(data["summary_text"], title)
        for user_id in user_ids:
            entry_store.save_entry(
                db,
                user_id,
                "github",
                title,
                f"https://github.com/{data['username']}",
                data["summary_text"],
                result,
                dedupe_same_title_today=True,
            )
        logger.info("GitHub activity saved for all users.")
    except Exception:
        logger.exception("Daily GitHub job failed")
    finally:
        db.close()


def _daily_leetcode_job():
    logger.info("Running daily LeetCode sync...")
    db = SessionLocal()
    try:
        from services.leetcode_today import fetch_today_submissions

        data = asyncio.run(fetch_today_submissions())
        if data["total_solved"] == 0:
            logger.info("No LeetCode problems solved today.")
            return
        user_ids = _all_user_ids(db)
        if len(user_ids) > 1:
            logger.warning(
                "Skipping scheduled LeetCode sync: multiple users with shared LEETCODE_USERNAME."
            )
            return
        title = f"LeetCode — {data['total_solved']} problem(s) solved"
        result = summarizer.summarize_transcript(data["summary_text"], title)
        for user_id in user_ids:
            entry_store.save_entry(
                db,
                user_id,
                "leetcode",
                title,
                f"https://leetcode.com/{data['username']}",
                data["summary_text"],
                result,
                dedupe_same_title_today=True,
            )
        logger.info("LeetCode activity saved for all users.")
    except Exception:
        logger.exception("Daily LeetCode job failed")
    finally:
        db.close()


def _daily_diary_job():
    logger.info("Generating daily diaries...")
    db = SessionLocal()
    try:
        from datetime import date

        from routes.diary import generate_diary_for_date

        today_str = date.today().isoformat()
        for user_id in _all_user_ids(db):
            generate_diary_for_date(db, user_id, today_str)
        logger.info("Daily diaries generated.")
    except Exception:
        logger.exception("Daily diary job failed")
    finally:
        db.close()


def start_scheduler():
    scheduler = BackgroundScheduler()

    scheduler.add_job(
        _daily_quiz_job,
        CronTrigger(hour=QUIZ_HOUR, minute=QUIZ_MINUTE),
        id="daily_quiz",
        replace_existing=True,
    )
    scheduler.add_job(
        _spaced_repetition_job,
        CronTrigger(hour=9, minute=0),
        id="spaced_repetition",
        replace_existing=True,
    )
    scheduler.add_job(
        _weekly_report_job,
        CronTrigger(day_of_week="sun", hour=20, minute=0),
        id="weekly_report",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: _batch_summarize_job(None),
        CronTrigger(hour=19, minute=0),
        id="batch_summarize",
        replace_existing=True,
    )
    scheduler.add_job(
        _daily_github_job,
        CronTrigger(hour=23, minute=30),
        id="daily_github",
        replace_existing=True,
    )
    scheduler.add_job(
        _daily_leetcode_job,
        CronTrigger(hour=23, minute=30),
        id="daily_leetcode",
        replace_existing=True,
    )
    scheduler.add_job(
        _daily_diary_job,
        CronTrigger(hour=23, minute=45),
        id="daily_diary",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "Scheduler started — batch 19:00, sync 23:30, quiz %02d:%02d",
        QUIZ_HOUR,
        QUIZ_MINUTE,
    )
    return scheduler
