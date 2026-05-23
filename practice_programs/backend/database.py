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
from sqlalchemy.orm import sessionmaker

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./learning_tracker.db")
USE_ALEMBIC = os.getenv("USE_ALEMBIC", "false").lower() in ("1", "true", "yes")


def _build_engine():
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


_TABLES_NEEDING_USER_ID = (
    "learning_entries",
    "quiz_results",
    "topic_reviews",
    "streaks",
    "daily_diaries",
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
