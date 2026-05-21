from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Date, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./learning_tracker.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class LearningEntry(Base):
    __tablename__ = "learning_entries"
    id          = Column(Integer, primary_key=True, index=True)
    source_type = Column(String)   # youtube | manual | github | leetcode | pdf | webpage
    title       = Column(String)
    source_url  = Column(String)
    raw_content = Column(Text)
    summary     = Column(Text)
    topics      = Column(String)   # comma-separated
    chroma_id   = Column(String)
    metadata_json = Column(Text)   # Stores watchTime, completion, etc.
    created_at  = Column(DateTime, default=datetime.utcnow)


class QuizResult(Base):
    __tablename__ = "quiz_results"
    id           = Column(Integer, primary_key=True, index=True)
    question     = Column(Text)
    topic        = Column(String)
    user_answer  = Column(String)
    correct_answer = Column(String)
    is_correct   = Column(Boolean)
    attempted_at = Column(DateTime, default=datetime.utcnow)


class TopicReview(Base):
    __tablename__ = "topic_reviews"
    id              = Column(Integer, primary_key=True, index=True)
    topic           = Column(String, unique=True, index=True)
    last_reviewed   = Column(Date)
    interval_days   = Column(Integer, default=1)
    times_correct   = Column(Integer, default=0)
    times_incorrect = Column(Integer, default=0)


class Streak(Base):
    __tablename__ = "streaks"
    id           = Column(Integer, primary_key=True, index=True)
    date         = Column(Date, unique=True)
    entry_count  = Column(Integer, default=0)


class DailyDiary(Base):
    __tablename__ = "daily_diaries"
    id           = Column(Integer, primary_key=True, index=True)
    date         = Column(Date, unique=True, index=True)
    summary      = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()