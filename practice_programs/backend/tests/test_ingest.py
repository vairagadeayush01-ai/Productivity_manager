"""
test_ingest.py — tests for the ingest service-layer logic.
"""

import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, LearningEntry, User
from services import entry_store
from core.security import hash_password


# ---------------------------------------------------------------------------
# In-memory test database
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture
def db(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    # Ensure a test user exists (user_id=1)
    if not session.query(User).filter_by(id=1).first():
        user = User(id=1, email="test@example.com", password_hash=hash_password("password"))
        session.add(user)
        session.commit()
    yield session
    session.rollback()
    session.close()


# ---------------------------------------------------------------------------
# entry_store.save_entry tests
# ---------------------------------------------------------------------------
class TestSaveEntry:
    def test_creates_new_entry(self, db):
        """save_entry should insert a new LearningEntry and return its dict."""
        result = entry_store.save_entry(
            db,
            user_id=1,
            source_type="manual",
            title="Test Note",
            source_url="",
            raw_content="Some content",
            summary_result={"summary": "A test summary", "topics": ["testing"], "key_concepts": []},
        )
        assert result["id"] is not None
        assert result["title"] == "Test Note"
        assert result["summary"] == "A test summary"

    def test_deduplicates_same_url_same_day(self, db):
        """Saving the same source_url twice on the same day should not create a duplicate."""
        kwargs = dict(
            db=db,
            user_id=1,
            source_type="youtube",
            title="Duplicate Video",
            source_url="https://youtube.com/watch?v=abc123",
            raw_content="transcript",
            summary_result={"summary": "video summary", "topics": ["python"], "key_concepts": []},
        )
        result1 = entry_store.save_entry(**kwargs)
        result2 = entry_store.save_entry(**kwargs)
        assert result1["id"] == result2["id"], "Duplicate entry created for same URL!"

    def test_stores_topics(self, db):
        """Topics list from ai_result should be persisted as comma-separated string."""
        result = entry_store.save_entry(
            db,
            user_id=1,
            source_type="leetcode",
            title="Two Sum",
            source_url="https://leetcode.com/problems/two-sum",
            raw_content="Two pointers problem",
            summary_result={
                "summary": "Hash map approach",
                "topics": ["arrays", "hash-map", "two-pointers"],
                "key_concepts": [],
            },
        )
        entry = db.query(LearningEntry).filter_by(id=result["id"]).first()
        assert "arrays" in (entry.topics or "")
        assert "hash-map" in (entry.topics or "")

    def test_different_users_isolated(self, db, engine):
        """Entries for user 1 and user 2 should not interfere."""
        # Create user 2
        if not db.query(User).filter_by(id=2).first():
            db.add(User(id=2, email="other@example.com", password_hash=hash_password("pw")))
            db.commit()

        r1 = entry_store.save_entry(
            db, user_id=1, source_type="manual", title="User1 Note",
            source_url="", raw_content="content",
            summary_result={"summary": "u1", "topics": [], "key_concepts": []},
        )
        r2 = entry_store.save_entry(
            db, user_id=2, source_type="manual", title="User2 Note",
            source_url="", raw_content="content",
            summary_result={"summary": "u2", "topics": [], "key_concepts": []},
        )
        assert r1["id"] != r2["id"]

        u1_entries = db.query(LearningEntry).filter_by(user_id=1).all()
        u2_entries = db.query(LearningEntry).filter_by(user_id=2).all()
        u1_ids = {e.id for e in u1_entries}
        u2_ids = {e.id for e in u2_entries}
        assert not u1_ids.intersection(u2_ids), "User data isolation broken!"
