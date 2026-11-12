"""Verify exact rule semantics and response persistence on migrated PostgreSQL."""
from datetime import datetime, timezone
from uuid import uuid4
import pytest
from sqlalchemy import delete, inspect, select
from sqlalchemy.exc import IntegrityError
from app.auth.model import User
from app.assistant.model import AssistantMessage
from app.assistant.schema import PromptRequest
from app.assistant.service import AssistantService, RESPONSES, FALLBACK, resolve_prompt


@pytest.mark.parametrize("prompt,key", [
    ("Q4 Board Presentation Ready", "q4"), ("TCS Contract Expansion Analysis", "tcs"),
    ("Risk Mitigation Plan", "risk"), ("Innovation Investment Strategy", "innovation"),
    ("innovation risk TCS Q4", "q4"), ("innovation risk TCS", "tcs"),
    ("innovation RISK", "risk"), ("INNOVATION!", "innovation"), ("(risk)", "risk"),
    ("brisk innovations q40 tcs2", None), ("", None), ("_risk risk_", None),
    ("érisk risk中", None), ("²risk riskⅧ", None), ("risḱ", "risk"),
    ("rısk RİSK", None), ("riſk", "risk"), ("x" * 10000 + " q4", "q4"),
    ("<script>alert(1)</script>", None),
])
def test_exact_resolution_boundaries_priority_and_safe_fallback(prompt, key):
    """Match Unicode letter/number boundaries and all approved narrative strings."""
    assert resolve_prompt(prompt) == (RESPONSES[key] if key else FALLBACK)


def test_response_only_storage_owner_pages_and_timestamp_ties(db):
    """Persist responses, isolate owners and break equal creation timestamps by UUID."""
    owners = [User(username=name, password_hash="test") for name in ["one", "two"]]
    db.add_all(owners); db.commit()
    service = AssistantService(db)
    assert service.history(owners[0].id).model_dump() == {"items": [], "total": 0}
    saved = [service.respond(owners[0].id, PromptRequest(prompt=key)) for key in RESPONSES]
    service.respond(owners[1].id, PromptRequest(prompt="private prompt"))
    assert all(item.role == "assistant" and item.created_at.tzinfo for item in saved)
    assert len({item.id for item in saved}) == 4
    rows = list(db.scalars(select(AssistantMessage).where(AssistantMessage.user_id == owners[0].id)))
    for row in rows: row.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    db.commit(); db.expire_all()
    expected = sorted([item.id for item in saved])
    page = service.history(owners[0].id, 2, 1)
    assert page.total == 4
    assert [item.id for item in page.items] == expected[1:3]
    assert service.history(owners[0].id, 100, 4).items == []
    assert service.history(owners[1].id).total == 1
    columns = {item["name"] for item in inspect(db.bind).get_columns("assistant_messages")}
    assert columns == {"id", "user_id", "role", "text", "created_at"}
    assert all(row.text in RESPONSES.values() for row in rows)
    db.execute(delete(User).where(User.id == owners[0].id)); db.commit()
    assert service.history(owners[0].id).total == 0
    assert service.history(owners[1].id).total == 1


@pytest.mark.parametrize("limit,offset", [(0,0), (101,0), (1,-1), (True,0), (1,False), (1.5,0)])
def test_service_rejects_invalid_pagination(db, limit, offset):
    """Protect non-HTTP callers from unbounded or invalid history reads."""
    with pytest.raises(ValueError): AssistantService(db).history(uuid4(), limit, offset)


def test_database_enforces_foreign_key_role_and_indexes_and_rolls_back(db):
    """Verify migration constraints with real rejected inserts and a usable session."""
    service = AssistantService(db)
    with pytest.raises(IntegrityError): service.respond(uuid4(), PromptRequest(prompt="risk"))
    owner = User(username="valid", password_hash="test"); db.add(owner); db.commit()
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(AssistantMessage(user_id=owner.id, role="user", text="private")); db.flush()
    assert service.respond(owner.id, PromptRequest(prompt="risk")).text == RESPONSES["risk"]
    indexes = {item["name"] for item in inspect(db.bind).get_indexes("assistant_messages")}
    assert {"ix_assistant_messages_user_id", "ix_assistant_messages_user_created"} <= indexes
