"""Verify versioned HTTP auth contracts through a real PostgreSQL test database."""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import pytest
import httpx
from sqlalchemy import select, func
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from app.auth.model import User, AuthSession
from app.auth.schema import Credentials
from app.auth.service import AuthService
from app.core.database import get_db
from app.main import create_app
from app.core.security import issue_token, decode_token


async def test_register_login_me_logout_http_contract_and_persisted_state(client, db, settings):
    """Exercise public account serialization, restoration and revocation over HTTP."""
    credentials = {"username": " CIO ", "password": " exact "}
    registered = await client.post("/api/v1/auth/register", json=credentials)
    assert registered.status_code == 201
    account = registered.json()
    assert set(account) == {"id", "username", "created_at"}
    assert account["username"] == "cio"
    assert db.get(User, UUID(account["id"])).password_hash != credentials["password"]
    login = await client.post("/api/v1/auth/login", json=credentials)
    assert login.status_code == 200
    body = login.json()
    assert body["token_type"] == "bearer"
    assert body["account"] == account
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json() == account
    logout = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204
    assert logout.content == b""
    _, session_id = decode_token(body["access_token"], settings)
    db.expire_all()
    assert db.get(AuthSession, session_id).revoked_at is not None
    assert db.get(User, UUID(account["id"])) is not None
    for path, method in [("me", client.get), ("logout", client.post)]:
        response = await method(f"/api/v1/auth/{path}", headers=headers)
        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid credentials"}
    assert (await client.post("/api/v1/auth/login", json=credentials)).status_code == 200


async def test_duplicate_registration_is_409_and_leaves_saved_hash_unchanged(client, db):
    """Do not overwrite canonical duplicates or leak private account fields."""
    assert (await client.post("/api/v1/auth/register", json={"username": "demo", "password": "first"})).status_code == 201
    saved_hash = db.scalar(select(User)).password_hash
    duplicate = await client.post("/api/v1/auth/register", json={"username": " DEMO ", "password": "other"})
    assert duplicate.status_code == 409
    assert db.scalar(select(User)).password_hash == saved_hash


@pytest.mark.parametrize("payload", [{}, {"username": "x"}, {"password": "secret"},
    {"username": " ", "password": "secret"}, {"username": 123, "password": "secret"},
    {"username": "x", "password": 123}, {"username": "x", "password": ""},
    {"username": "x" * 101, "password": "secret"}, {"username": "x", "password": "secret" * 1000},
    {"username": "x", "password": "secret", "user_id": "forged"}])
@pytest.mark.parametrize("endpoint", ["register", "login"])
async def test_invalid_credentials_are_422_without_echoing_password(client, endpoint, payload):
    """Reject missing, typed, empty, oversized and owner-injection inputs safely."""
    response = await client.post(f"/api/v1/auth/{endpoint}", json=payload)
    assert response.status_code == 422
    assert "secret" not in response.text


async def test_wrong_password_and_absent_user_share_generic_401(client):
    """Make username existence indistinguishable in response bodies and status."""
    await client.post("/api/v1/auth/register", json={"username": "demo", "password": "x"})
    responses = [await client.post("/api/v1/auth/login", json={"username": name, "password": "wrong"}) for name in ["demo", "absent", "' OR 1=1 --"]]
    assert all(response.status_code == 401 for response in responses)
    assert all(response.json() == {"detail": "Invalid credentials"} for response in responses)


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer broken", "Bearer"])
@pytest.mark.parametrize("endpoint", ["me", "logout"])
async def test_missing_or_malformed_bearer_is_generic_401(client, header, endpoint):
    """Reject both protected auth operations without valid server credentials."""
    method = client.get if endpoint == "me" else client.post
    response = await method(f"/api/v1/auth/{endpoint}", headers={"Authorization": header} if header else {})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("kind", ["jwt_expired", "unknown_session", "wrong_owner", "db_expired"])
async def test_signed_invalid_session_is_rejected_over_http(client, db, settings, kind):
    """Validate database ownership and lifetime in addition to signed JWT claims."""
    credentials = {"username": "demo", "password": "x"}
    await client.post("/api/v1/auth/register", json=credentials)
    response = await client.post("/api/v1/auth/login", json=credentials)
    user_id, session_id = decode_token(response.json()["access_token"], settings)
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    if kind == "jwt_expired": future -= timedelta(hours=2)
    elif kind == "unknown_session": session_id = uuid4()
    elif kind == "wrong_owner": user_id = uuid4()
    elif kind == "db_expired": db.get(AuthSession, session_id).expires_at = future - timedelta(hours=2); db.commit()
    token = issue_token(user_id, session_id, future, settings)
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_health_is_dependency_free_and_account_text_is_not_executable(client):
    """Keep health stable and preserve potentially hostile usernames as JSON text."""
    health = await client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    response = await client.post("/api/v1/auth/register", json={"username": "<script>alert(1)</script>", "password": "x"})
    assert response.status_code == 201
    assert response.json()["username"] == "<script>alert(1)</script>"


async def test_health_requires_no_database_or_lifespan():
    """Exercise liveness with no database dependency even while PostgreSQL is down."""
    import httpx
    from app.main import create_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}



@pytest.mark.parametrize("failure_kind,status,detail", [
    ("database", 503, "Service unavailable"),
    ("unexpected", 500, "Internal server error"),
])
async def test_http_failures_are_sanitized_without_substituting_database(
    db, settings, monkeypatch, caplog, failure_kind, status, detail
):
    """Exercise real HTTP exception handlers with a safe service-boundary fault."""
    account = AuthService(db, settings).register(Credentials(username="original", password="keep"))
    original_hash = db.get(User, account.id).password_hash
    private_detail = "fault-marker SQL SELECT password_hash; password=private-password traceback"
    injected = []

    def fail_registration(service: AuthService, credentials: Credentials) -> None:
        """Verify the live database before injecting the selected boundary failure."""
        assert service.repo.db is db
        assert service.repo.db.scalar(select(func.count()).select_from(User)) == 1
        injected.append(failure_kind)
        if failure_kind == "database":
            raise OperationalError(private_detail, {"password": credentials.password}, RuntimeError(private_detail))
        raise RuntimeError(private_detail)

    def real_database() -> Session:
        """Retain the test-owned PostgreSQL session in the app dependency."""
        return db

    application = create_app(settings)
    application.dependency_overrides[get_db] = real_database
    monkeypatch.setattr(AuthService, "register", fail_registration)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application, raise_app_exceptions=False),
            base_url="http://test",
        ) as connection:
            response = await connection.post("/api/v1/auth/register", json={
                "username": "failed", "password": "private-password",
            })
    finally:
        application.dependency_overrides.clear()
    assert injected == [failure_kind]
    assert response.status_code == status
    assert response.json() == {"detail": detail}
    for marker in ["fault-marker", "SELECT", "password_hash", "private-password", "traceback"]:
        assert marker not in response.text
        assert marker not in caplog.text
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.get(User, account.id).password_hash == original_hash
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0
