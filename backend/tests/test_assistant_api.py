"""Exercise history HTTP validation, authorization and real PostgreSQL state."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from app.auth.model import AuthSession
from app.auth.schema import Credentials
from app.auth.service import AuthService
from app.core.security import decode_token, issue_token
from app.assistant.model import AssistantMessage
from app.assistant.service import RESPONSES, FALLBACK


@pytest.fixture
def tokens(db, settings):
    """Create two independent persisted accounts and server-issued bearer sessions."""
    service = AuthService(db, settings)
    result = []
    for name in ["first", "second"]:
        credentials = Credentials(username=name, password="test")
        service.register(credentials)
        result.append(service.login(credentials).access_token)
    return result


def headers(token):
    """Attach only bearer credentials, never a selected owner."""
    return {"Authorization": f"Bearer {token}"}


async def test_history_response_shapes_order_pagination_and_owner_isolation(client, db, tokens):
    """Resolve all exact narratives over HTTP and persist no request text."""
    first, second = map(headers, tokens)
    path = "/api/v1/assistant/messages"
    assert (await client.get(path, headers=first)).json() == {"items": [], "total": 0}
    saved = []
    for prompt, text in [*RESPONSES.items(), ("unsupported <script>private</script>", FALLBACK), ("", FALLBACK)]:
        response = await client.post(path, headers=first, json={"prompt": prompt})
        assert response.status_code == 201
        body = response.json()
        assert set(body) == {"id", "role", "text", "created_at"}
        assert body["role"] == "assistant" and body["text"] == text
        assert datetime.fromisoformat(body["created_at"]).tzinfo
        saved.append(body)
    assert (await client.get(path, headers=second)).json() == {"items": [], "total": 0}
    assert (await client.get(path + "?limit=1&offset=2&user_id=forged", headers=first)).json() == {"items": saved[2:3], "total": 6}
    assert (await client.get(path + "?limit=100&offset=6", headers=first)).json() == {"items": [], "total": 6}
    assert (await client.get(path, headers=first)).json() == {"items": saved, "total": 6}
    db.expire_all()
    rows = list(db.scalars(select(AssistantMessage)))
    assert len(rows) == 6 and all(row.text in [*RESPONSES.values(), FALLBACK] for row in rows)


@pytest.mark.parametrize("payload", [{}, {"prompt": None}, {"prompt": 12}, {"prompt": []},
    {"prompt": {}}, {"prompt": True}, {"prompt": "private", "user_id": "forged"},
    {"prompt": "private", "text": "injected"}, {"prompt": "private", "role": "user"}])
async def test_invalid_prompt_shapes_are_422_without_writes_or_echo(client, db, tokens, payload):
    """Reject typed payloads and client ownership/response injection without storing input."""
    result = await client.post("/api/v1/assistant/messages", headers=headers(tokens[0]), json=payload)
    assert result.status_code == 422 and "private" not in result.text
    assert db.scalar(select(func.count()).select_from(AssistantMessage)) == 0


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=1.5", "offset=abc", "limit=", "offset=1.5"])
async def test_invalid_page_bounds_are_422(client, tokens, query):
    """Bound every list query and reject malformed numeric pagination."""
    assert (await client.get("/api/v1/assistant/messages?" + query, headers=headers(tokens[0]))).status_code == 422


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer", "Bearer malformed"])
@pytest.mark.parametrize("method", ["get", "post"])
async def test_missing_malformed_auth_cannot_read_or_write(client, db, header, method):
    """Challenge unauthenticated callers on both assistant operations."""
    kwargs = {"headers": {"Authorization": header} if header else {}}
    if method == "post": kwargs["json"] = {"prompt": "risk"}
    response = await getattr(client, method)("/api/v1/assistant/messages", **kwargs)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert db.scalar(select(func.count()).select_from(AssistantMessage)) == 0


@pytest.mark.parametrize("kind", ["revoked", "jwt_expired", "db_expired", "wrong_owner", "unknown_session", "forged"])
@pytest.mark.parametrize("method", ["get", "post"])
async def test_invalid_persisted_sessions_cannot_access_history(client, db, settings, tokens, kind, method):
    """Enforce revocation, signature, owner and both expiration boundaries."""
    token = tokens[0]
    user_id, session_id = decode_token(token, settings)
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    if kind == "revoked": db.get(AuthSession, session_id).revoked_at = datetime.now(timezone.utc); db.commit()
    elif kind == "db_expired": db.get(AuthSession, session_id).expires_at = future - timedelta(hours=2); db.commit()
    elif kind == "jwt_expired": future -= timedelta(hours=2)
    elif kind == "wrong_owner": user_id = decode_token(tokens[1], settings)[0]
    elif kind == "unknown_session": session_id = uuid4()
    token = issue_token(user_id, session_id, future, settings)
    if kind == "forged": token = "x" + token
    kwargs = {"headers": headers(token)}
    if method == "post": kwargs["json"] = {"prompt": "risk"}
    assert (await getattr(client, method)("/api/v1/assistant/messages", **kwargs)).status_code == 401
    assert db.scalar(select(func.count()).select_from(AssistantMessage)) == 0
