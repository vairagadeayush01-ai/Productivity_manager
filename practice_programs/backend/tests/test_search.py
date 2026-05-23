"""
test_search.py — tests for search and history filter endpoints.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, LearningEntry, User, get_db
from core.security import hash_password, create_access_token
from Main import app


# ---------------------------------------------------------------------------
# Test DB + Client setup
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture(scope="module")
def db_session(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture(scope="module")
def client(engine):
    def override_get_db():
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="module")
def auth_headers(db_session):
    """Create a test user and return auth headers."""
    user = User(email="searchtest@example.com", password_hash=hash_password("pass"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Add test entries
    now = datetime.utcnow()
    entries = [
        LearningEntry(user_id=user.id, source_type="youtube", title="React Hooks Tutorial",
                      source_url="https://youtube.com/react", raw_content="hooks content",
                      summary="React hooks summary", topics="react, hooks", created_at=now),
        LearningEntry(user_id=user.id, source_type="leetcode", title="Two Sum",
                      source_url="https://leetcode.com/two-sum", raw_content="leetcode content",
                      summary="Hash map approach", topics="arrays, hash-map",
                      created_at=now - timedelta(days=2)),
        LearningEntry(user_id=user.id, source_type="github", title="GitHub — 3 commits",
                      source_url="https://github.com", raw_content="github content",
                      summary="Pushed 3 commits", topics="git",
                      created_at=now - timedelta(days=5)),
        LearningEntry(user_id=user.id, source_type="manual", title="Learned about JWT",
                      source_url="", raw_content="jwt content",
                      summary="JWT authentication", topics="security, jwt", created_at=now),
    ]
    db_session.add_all(entries)
    db_session.commit()

    token = create_access_token(user_id=user.id, email=user.email)
    return {"Authorization": f"Bearer {token}"}


class TestHistoryFilters:
    def test_no_filter_returns_all(self, client, auth_headers):
        """Without filters, /search/history returns all entries."""
        res = client.get("/search/history", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 4

    def test_source_type_filter_youtube(self, client, auth_headers):
        """source_type=youtube returns only YouTube entries."""
        res = client.get("/search/history?source_type=youtube", headers=auth_headers)
        assert res.status_code == 200
        entries = res.json()["entries"]
        assert all(e["source_type"] == "youtube" for e in entries)
        assert len(entries) >= 1

    def test_source_type_filter_leetcode(self, client, auth_headers):
        """source_type=leetcode returns only LeetCode entries."""
        res = client.get("/search/history?source_type=leetcode", headers=auth_headers)
        assert res.status_code == 200
        entries = res.json()["entries"]
        assert all(e["source_type"] == "leetcode" for e in entries)

    def test_invalid_source_type_ignored(self, client, auth_headers):
        """An unknown source_type is silently ignored — returns all."""
        res = client.get("/search/history?source_type=invalid_type", headers=auth_headers)
        assert res.status_code == 200
        # Should behave same as no filter
        all_res = client.get("/search/history", headers=auth_headers)
        assert res.json()["total"] == all_res.json()["total"]

    def test_date_filter_start_date(self, client, auth_headers):
        """start_date filters out entries older than the given date."""
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
        res = client.get(f"/search/history?start_date={yesterday}", headers=auth_headers)
        assert res.status_code == 200
        entries = res.json()["entries"]
        # Only entries from today should appear
        for entry in entries:
            entry_date = datetime.fromisoformat(entry["created_at"].replace("Z", ""))
            assert entry_date >= datetime.strptime(yesterday, "%Y-%m-%d")

    def test_combined_filter(self, client, auth_headers):
        """source_type + start_date combination should narrow results correctly."""
        today = datetime.utcnow().strftime("%Y-%m-%d")
        res = client.get(f"/search/history?source_type=youtube&start_date={today}", headers=auth_headers)
        assert res.status_code == 200
        entries = res.json()["entries"]
        assert all(e["source_type"] == "youtube" for e in entries)

    def test_unauthenticated_returns_401(self, client):
        """History endpoint requires authentication."""
        res = client.get("/search/history")
        assert res.status_code == 401

    def test_pagination(self, client, auth_headers):
        """skip and limit parameters work correctly."""
        res_all = client.get("/search/history?limit=100", headers=auth_headers)
        total = res_all.json()["total"]

        res_page1 = client.get("/search/history?skip=0&limit=2", headers=auth_headers)
        res_page2 = client.get("/search/history?skip=2&limit=2", headers=auth_headers)

        page1_ids = {e["id"] for e in res_page1.json()["entries"]}
        page2_ids = {e["id"] for e in res_page2.json()["entries"]}
        assert not page1_ids.intersection(page2_ids), "Pagination overlap!"


class TestStats:
    def test_stats_returns_counts(self, client, auth_headers):
        """GET /search/stats should return correct aggregate counts."""
        res = client.get("/search/stats", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert "total_entries" in data
        assert "youtube" in data
        assert "leetcode" in data
        assert "github" in data
        assert data["total_entries"] >= 4
        assert data["youtube"] >= 1
        assert data["leetcode"] >= 1
