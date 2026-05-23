"""Shared date/time helpers for consistent DB filtering."""
from datetime import date, datetime


def today_start_end() -> tuple[datetime, datetime]:
    """Return UTC-naive start/end of today for SQLAlchemy range queries."""
    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())
    return start, end
