def test_register_and_login(client):
    reg = client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "password1234"},
    )
    assert reg.status_code == 200
    assert "access_token" in reg.json()
    assert reg.json()["user"]["email"] == "alice@example.com"

    dup = client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "otherpass123"},
    )
    assert dup.status_code == 400

    login = client.post(
        "/auth/login",
        json={"email": "alice@example.com", "password": "password1234"},
    )
    assert login.status_code == 200
    assert login.json()["access_token"]


def test_protected_route_requires_auth(client):
    res = client.get("/search/today")
    assert res.status_code == 401


from unittest.mock import patch


@patch(
    "routes.ingest.summarize_manual_log",
    return_value={"summary": "JWT basics", "topics": ["jwt", "auth"], "key_concepts": []},
)
def test_user_data_isolation(_mock_summarize, client):
    """Two users cannot see each other's entries."""
    r1 = client.post(
        "/auth/register",
        json={"email": "user1@example.com", "password": "password1234"},
    )
    t1 = r1.json()["access_token"]
    h1 = {"Authorization": f"Bearer {t1}"}

    r2 = client.post(
        "/auth/register",
        json={"email": "user2@example.com", "password": "password1234"},
    )
    t2 = r2.json()["access_token"]
    h2 = {"Authorization": f"Bearer {t2}"}

    client.post("/ingest/log", json={"note": "User 1 learned JWT today"}, headers=h1)

    today_u1 = client.get("/search/today", headers=h1)
    today_u2 = client.get("/search/today", headers=h2)

    assert today_u1.json()["count"] == 1
    assert today_u2.json()["count"] == 0
