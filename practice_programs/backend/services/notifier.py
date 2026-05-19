"""
notifier.py — Windows desktop notifications using plyer.
Shows a popup notification in the bottom right corner of the screen.
"""
from plyer import notification
import os


APP_NAME = "Learning Tracker"
ICON_PATH = os.path.join(os.path.dirname(__file__), "..", "icon.ico")


def notify(title: str, message: str, timeout: int = 8):
    """
    Sends a Windows desktop notification.
    timeout = how many seconds the popup stays visible.
    """
    try:
        kwargs = dict(
            app_name = APP_NAME,
            title    = title,
            message  = message,
            timeout  = timeout,
        )
        # Only add icon if the file exists
        if os.path.exists(ICON_PATH):
            kwargs["app_icon"] = ICON_PATH

        notification.notify(**kwargs)
    except Exception as e:
        # Notifications failing should never crash the app
        print(f"[Notifier] Could not send notification: {e}")


def notify_quiz_ready(n_questions: int):
    notify(
        title   = "📚 Daily Quiz Ready!",
        message = f"You have {n_questions} questions based on today's learning. Open the app to start.",
        timeout = 10
    )


def notify_spaced_repetition(topics: list[str]):
    topic_str = ", ".join(topics[:3])
    if len(topics) > 3:
        topic_str += f" and {len(topics)-3} more"
    notify(
        title   = "🔁 Time to Review!",
        message = f"Topics due for revision: {topic_str}",
        timeout = 10
    )


def notify_weekly_report():
    notify(
        title   = "📊 Weekly Report Ready",
        message = "Your weekly learning report card is ready. Open the app to view it.",
        timeout = 10
    )