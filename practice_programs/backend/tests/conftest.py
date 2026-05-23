"""Pytest fixtures — in-memory SQLite, isolated per test."""
import os

# Must set env before database/Main are imported
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-only-min-32-chars"
os.environ["USE_ALEMBIC"] = "false"

import pytest
from fastapi.testclient import TestClient

from database import Base, SessionLocal, engine, get_db
from Main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client):
    res = client.post(
        "/auth/register",
        json={"email": "test@example.com", "password": "securepass123"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
