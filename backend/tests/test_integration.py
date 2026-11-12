"""Verify authentication, assistant persistence and revocation across real feature boundaries."""
import pytest
from sqlalchemy import select
from app.auth.model import User
from app.assistant.model import AssistantMessage


@pytest.mark.asyncio
async def test_accounts_history_isolation_revocation_and_relogin(client, db):
    """Retain only each account's responses across logout and a new persisted session."""
    credentials = {"username": "integration-a", "password": "synthetic-password"}
    other = {"username": "integration-b", "password": "synthetic-password"}
    for account in (credentials, other):
        response = await client.post("/api/v1/auth/register", json=account)
        assert response.status_code == 201
        assert "password" not in response.text
    login = await client.post("/api/v1/auth/login", json=credentials)
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/v1/assistant/messages", headers=headers, json={"prompt": "risk"})
    assert created.status_code == 201
    assert created.json()["text"] == "Strengthen cybersecurity posture and compliance tracking across regions."
    history = await client.get("/api/v1/assistant/messages", headers=headers)
    assert history.status_code == 200
    assert history.json()["items"][0]["id"] == created.json()["id"]
    second_login = await client.post("/api/v1/auth/login", json=other)
    assert second_login.status_code == 200
    other_headers = {"Authorization": f"Bearer {second_login.json()['access_token']}"}
    isolated = await client.get("/api/v1/assistant/messages", headers=other_headers)
    assert isolated.status_code == 200
    assert isolated.json() == {"items": [], "total": 0}
    logout = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204
    for endpoint in ("/api/v1/auth/me", "/api/v1/assistant/messages"):
        assert (await client.get(endpoint, headers=headers)).status_code == 401
    assert (await client.post("/api/v1/assistant/messages", headers=headers, json={"prompt": "q4"})).status_code == 401
    renewed = await client.post("/api/v1/auth/login", json=credentials)
    assert renewed.status_code == 200
    restored = await client.get("/api/v1/assistant/messages", headers={"Authorization": f"Bearer {renewed.json()['access_token']}"})
    assert restored.status_code == 200
    assert restored.json()["total"] == 1
    assert len(db.scalars(select(User)).all()) == 2
    assert len(db.scalars(select(AssistantMessage)).all()) == 1


@pytest.mark.asyncio
async def test_invalid_upstream_auth_never_writes_history(client, db):
    """Propagate missing identity and invalid credentials without orphan response records."""
    rejected = await client.post("/api/v1/auth/login", json={"username": "missing", "password": "wrong"})
    assert rejected.status_code == 401
    assert (await client.post("/api/v1/assistant/messages", json={"prompt": "innovation"})).status_code == 401
    assert (await client.get("/api/v1/assistant/messages", headers={"Authorization": "Bearer forged"})).status_code == 401
    assert db.scalars(select(AssistantMessage)).all() == []
