import logging
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.pool import StaticPool

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./learning_tracker.db")
USE_ALEMBIC = os.getenv("USE_ALEMBIC", "false").lower() in ("1", "true", "yes")


def _build_engine():
    if DATABASE_URL == "sqlite:///:memory:":
        return create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    if DATABASE_URL.startswith("sqlite"):
        return create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
    return create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    )


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # ── Phase 2.1 profile fields (added via migration 003) ─────────────────
    username = Column(String, unique=True, nullable=True)
    display_name = Column(String, nullable=True)
    github_username = Column(String, nullable=True)
    github_pat_enc = Column(Text, nullable=True)      # AES-256-GCM encrypted PAT
    leetcode_username = Column(String, nullable=True)
    extension_installed = Column(Boolean, default=False, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    google_credentials_enc = Column(Text, nullable=True)  # AES encrypted JSON token



class LearningEntry(Base):
    __tablename__ = "learning_entries"
    __table_args__ = (
        Index("idx_learning_user_created", "user_id", "created_at"),
        Index("idx_learning_user_source", "user_id", "source_type"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    source_type = Column(String)
    title = Column(String)
    source_url = Column(String)
    raw_content = Column(Text)
    summary = Column(Text)
    topics = Column(String)
    chroma_id = Column(String)
    metadata_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class QuizResult(Base):
    __tablename__ = "quiz_results"
    __table_args__ = (Index("idx_quiz_user", "user_id"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    question = Column(Text)
    topic = Column(String)
    user_answer = Column(String)
    correct_answer = Column(String)
    is_correct = Column(Boolean)
    attempted_at = Column(DateTime, default=datetime.utcnow)


class TopicReview(Base):
    __tablename__ = "topic_reviews"
    __table_args__ = (UniqueConstraint("user_id", "topic", name="uq_user_topic"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    topic = Column(String, index=True)
    last_reviewed = Column(Date)
    interval_days = Column(Integer, default=1)
    times_correct = Column(Integer, default=0)
    times_incorrect = Column(Integer, default=0)


class Streak(Base):
    __tablename__ = "streaks"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_streak_date"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date = Column(Date)
    entry_count = Column(Integer, default=0)


class DailyDiary(Base):
    __tablename__ = "daily_diaries"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_diary_date"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    date = Column(Date, index=True)
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class RefreshToken(Base):
    """
    DB-backed refresh token for JWT rotation.
    token_hash stores bcrypt hash of the opaque token string.
    Revoked tokens kept for audit trail; a cleanup job can purge expired ones.
    """
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_token_user", "user_id"),
        Index("idx_refresh_token_expires", "expires_at"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), unique=True, nullable=False)
    device_info = Column(String(500), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ActivitySyncQueue(Base):
    """
    Offline-first queue for activities submitted from the Chrome extension.

    Lifecycle:
      pending   → being processed by sync_queue service
      done      → successfully converted to a LearningEntry
      failed    → exceeded max_retries or unrecoverable error

    dedupe_key = sha256(activity_type:source_id:date_utc) set by the extension.
    The UNIQUE constraint on dedupe_key ensures idempotent processing.

    user_id is nullable because the extension may queue activities before
    the user has authenticated. The sync endpoint resolves user_id from the JWT.
    """
    __tablename__ = "activity_sync_queue"
    __table_args__ = (
        Index("idx_sync_queue_status_created", "status", "created_at"),
        Index("idx_sync_queue_user_status", "user_id", "status"),
        UniqueConstraint("dedupe_key", name="uq_activity_dedupe_key"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    device_id = Column(String(100), nullable=False)
    # youtube_watch | leetcode_solve
    activity_type = Column(String(50), nullable=False)
    # Raw JSON payload from extension
    payload = Column(Text, nullable=False)
    # sha256 fingerprint — prevents double-processing
    dedupe_key = Column(String(64), nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=5, nullable=False)
    # pending | processing | done | failed
    status = Column(String(20), default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    last_attempt_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)



# ─── Phase 2 Models ───────────────────────────────────────────────────────────

class QuizSession(Base):
    """Tracks a full quiz session (multiple questions, session-level analytics)."""
    __tablename__ = "quiz_sessions"
    __table_args__ = (Index("idx_quiz_session_user_started", "user_id", "started_at"),)
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_type    = Column(String(30))       # daily | topic_deep_dive | review
    topic           = Column(String, nullable=True)
    status          = Column(String(20), default="active")  # active | completed | abandoned
    total_questions = Column(Integer, default=0)
    correct_count   = Column(Integer, default=0)
    started_at      = Column(DateTime, default=datetime.utcnow)
    completed_at    = Column(DateTime, nullable=True)


class TutorConversation(Base):
    """An AI tutor conversation session — expires after 24h."""
    __tablename__ = "tutor_conversations"
    __table_args__ = (Index("idx_tutor_conv_user", "user_id"),)
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    context_type = Column(String(50))     # quiz_followup | general | topic_deep_dive
    source_ref   = Column(Text, nullable=True)   # JSON — what triggered this
    expires_at   = Column(DateTime)              # created_at + 24h
    created_at   = Column(DateTime, default=datetime.utcnow)
    # ── Phase 3.3: distillation lifecycle ─────────────────────────────────
    distilled_summary = Column(Text, nullable=True)   # Groq-generated key insights after expiry
    distilled_at      = Column(DateTime, nullable=True)  # when distillation ran


class TutorMessage(Base):
    """Individual message in a tutor conversation."""
    __tablename__ = "tutor_messages"
    __table_args__ = (Index("idx_tutor_msg_conv", "conversation_id"),)
    id              = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("tutor_conversations.id", ondelete="CASCADE"), nullable=False)
    role            = Column(String(20))   # user | assistant
    content         = Column(Text)
    source_refs     = Column(Text, default="[]")  # JSON array of cited source entries
    created_at      = Column(DateTime, default=datetime.utcnow)


class CalendarEvent(Base):
    """Learning-related calendar events, optionally synced to Google Calendar."""
    __tablename__ = "calendar_events"
    __table_args__ = (Index("idx_calendar_user_time", "user_id", "start_time"),)
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    google_event_id = Column(String, nullable=True)   # set after Google Calendar sync
    title           = Column(String, nullable=False)
    description     = Column(Text, nullable=True)
    start_time      = Column(DateTime, nullable=False)
    end_time        = Column(DateTime, nullable=False)
    status          = Column(String(20), default="pending")  # pending | synced | failed
    created_at      = Column(DateTime, default=datetime.utcnow)


_TABLES_NEEDING_USER_ID = (

    "learning_entries",
    "quiz_results",
    "topic_reviews",
    "streaks",
    "daily_diaries",
    # New tables added in Phase 1.1 already have correct schema
    # activity_sync_queue and refresh_tokens are excluded here
)


def run_alembic_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
    command.upgrade(alembic_cfg, "head")
    logger.info("Alembic migrations applied (head)")


def _migrate_add_user_id_columns() -> None:
    """SQLite legacy: add user_id column if missing (pre-Phase-2 databases)."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    insp = inspect(engine)
    if not insp.has_table("learning_entries"):
        return

    with engine.begin() as conn:
        for table in _TABLES_NEEDING_USER_ID:
            if not insp.has_table(table):
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if "user_id" not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER DEFAULT 1"))
                logger.info("Added user_id column to %s", table)


def _bootstrap_legacy_user() -> None:
    from core.security import hash_password

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        email = os.getenv("BOOTSTRAP_USER_EMAIL", "").strip().lower()
        password = os.getenv("BOOTSTRAP_USER_PASSWORD", "").strip()
        if not email or not password:
            logger.info(
                "No users yet. Register at /auth/register or set BOOTSTRAP_USER_EMAIL "
                "and BOOTSTRAP_USER_PASSWORD in .env to claim existing data."
            )
            return
        user = User(email=email, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)
        if user.id != 1:
            for table in _TABLES_NEEDING_USER_ID:
                db.execute(
                    text(f"UPDATE {table} SET user_id = :uid WHERE user_id = 1"),
                    {"uid": user.id},
                )
            db.commit()
        logger.info("Bootstrap user created: %s (id=%s)", email, user.id)
    finally:
        db.close()


def init_db():
    if USE_ALEMBIC or DATABASE_URL.startswith("postgresql"):
        run_alembic_migrations()
    else:
        Base.metadata.create_all(bind=engine)
        _migrate_add_user_id_columns()
    _bootstrap_legacy_user()


def verify_database_path() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        logger.info("Using database: %s", DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
        return
    backend_dir = Path(__file__).resolve().parent
    canonical = backend_dir / "learning_tracker.db"
    orphan = backend_dir / "learning.db"
    if orphan.exists() and not canonical.exists():
        logger.warning(
            "Found learning.db but not learning_tracker.db. "
            "Set DATABASE_URL=sqlite:///./learning.db or rename the file."
        )
    elif orphan.exists() and canonical.exists():
        logger.warning(
            "Both learning.db and learning_tracker.db exist — remove the unused file."
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
