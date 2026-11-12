"""Verify real auth persistence, exact hashing and server session boundaries."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth.model import User, AuthSession
from app.auth.schema import Credentials
from app.auth.service import AuthService, DuplicateUsername, InvalidCredentials
from app.core.security import hash_password, verify_password, issue_token, decode_token


def test_registration_hashes_exact_long_password_and_rejects_duplicate(db, settings):
    """Persist salted full-password hashes and preserve existing credentials on conflict."""
    service = AuthService(db, settings)
    password = " x " + "a" * 100 + "é"
    account = service.register(Credentials(username=" CIO.DEMO ", password=password))
    saved = db.get(User, account.id)
    assert saved.username == "cio.demo"
    assert saved.password_hash != password
    assert verify_password(password, saved.password_hash)
    assert not verify_password(password[:-1] + "z", saved.password_hash)
    assert not verify_password(password.strip(), saved.password_hash)
    assert saved.created_at.tzinfo is not None
    with pytest.raises(DuplicateUsername):
        service.register(Credentials(username="CIO.DEMO", password="different"))
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.get(User, account.id).password_hash == saved.password_hash


def test_login_logout_revokes_only_current_session_and_retains_account(db, settings):
    """Save distinct sessions and preserve another login after one logout."""
    service = AuthService(db, settings)
    credentials = Credentials(username="demo", password=" exact ")
    account = service.register(credentials)
    first = service.login(credentials)
    second = service.login(credentials)
    user_id, session_id = decode_token(first.access_token, settings)
    assert user_id == account.id
    assert db.get(AuthSession, session_id).user_id == account.id
    service.logout(first.access_token)
    assert db.get(AuthSession, session_id).revoked_at is not None
    assert db.get(User, account.id) is not None
    with pytest.raises(InvalidCredentials):
        service.authenticate(first.access_token)
    assert service.authenticate(second.access_token)[0].id == account.id


@pytest.mark.parametrize("username,password", [("missing", "x"), ("demo", "wrong"), ("demo", "exact")])
def test_invalid_login_creates_no_session(db, settings, username, password):
    """Reject absent users and mismatched or trimmed passwords without session writes."""
    service = AuthService(db, settings)
    service.register(Credentials(username="demo", password=" exact "))
    with pytest.raises(InvalidCredentials, match="Invalid credentials"):
        service.login(Credentials(username=username, password=password))
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


@pytest.mark.parametrize("kind", ["malformed", "expired", "missing_session", "wrong_owner", "database_expired", "revoked", "forged"])
def test_authentication_rejects_invalid_session_states(db, settings, kind):
    """Enforce JWT signature/expiry and the persisted jti-owner-lifetime boundary."""
    service = AuthService(db, settings)
    credentials = Credentials(username="demo", password="x")
    account = service.register(credentials)
    token = service.login(credentials).access_token
    _, session_id = decode_token(token, settings)
    session = db.get(AuthSession, session_id)
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    if kind == "malformed": token = "not.a.token"
    elif kind == "expired": token = issue_token(account.id, session_id, future - timedelta(hours=2), settings)
    elif kind == "missing_session": token = issue_token(account.id, uuid4(), future, settings)
    elif kind == "wrong_owner": token = issue_token(uuid4(), session_id, future, settings)
    elif kind == "forged": token = issue_token(account.id, session_id, future, settings.model_copy(update={"jwt_secret": __import__("pydantic").SecretStr("different-signing-secret-at-least-32-characters")}))
    elif kind == "database_expired": session.expires_at = future - timedelta(hours=2); db.commit()
    elif kind == "revoked": service.logout(token)
    with pytest.raises(InvalidCredentials): service.authenticate(token)


def test_hashes_are_salted_and_corrupt_hashes_fail_closed():
    """Preserve full Unicode/NUL material without accepting invalid stored hashes."""
    password = "a" * 72 + "\0é"
    first = hash_password(password)
    assert first != hash_password(password)
    assert verify_password(password, first)
    assert not verify_password("a" * 72 + "different", first)
    assert not verify_password(password, "corrupt")


def test_seed_is_gated_idempotent_and_never_resets_password(db, settings):
    """Seed only when enabled and preserve account hashes on repeated startups."""
    service = AuthService(db, settings)
    service.seed()
    assert db.scalar(select(func.count()).select_from(User)) == 0
    enabled = settings.model_copy(update={"seed_on_startup": True})
    AuthService(db, enabled).seed()
    saved = db.scalar(select(User))
    original_hash = saved.password_hash
    AuthService(db, enabled).seed()
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(User)).password_hash == original_hash


def test_database_enforces_foreign_key_unique_not_null_and_cascade(db, settings):
    """Verify actual PostgreSQL integrity rather than repository stand-ins."""
    service = AuthService(db, settings)
    credentials = Credentials(username="demo", password="x")
    account = service.register(credentials)
    service.login(credentials)
    for record in [User(username="demo", password_hash="hash"), User(username="other", password_hash=None),
                   AuthSession(user_id=uuid4(), expires_at=datetime.now(timezone.utc))]:
        with pytest.raises(IntegrityError):
            with db.begin_nested(): db.add(record); db.flush()
    db.execute(delete(User).where(User.id == account.id))
    db.flush()
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 0



def test_registration_save_time_unique_race_rolls_back_and_preserves_winner(db, settings, monkeypatch):
    """Interleave a winning insert after lookup and exercise the real 23505 catch."""
    service = AuthService(db, settings)
    original_save = service.repo.save
    winner_hash = hash_password("winning password")
    winner = User(username="race", password_hash=winner_hash)

    def save_after_winner(record: User | AuthSession) -> None:
        """Commit the winner before the losing insert without replacing PostgreSQL."""
        original_save(winner)
        original_save(record)

    monkeypatch.setattr(service.repo, "save", save_after_winner)
    with pytest.raises(DuplicateUsername, match="Username already exists") as caught:
        service.register(Credentials(username=" RACE ", password="losing password"))
    assert isinstance(caught.value.__cause__, IntegrityError)
    assert caught.value.__cause__.orig.sqlstate == "23505"
    assert db.is_active
    # A new identity map rereads PostgreSQL after the service's rollback.
    with Session(bind=db.connection(), join_transaction_mode="create_savepoint") as reader:
        rows = list(reader.scalars(select(User)))
        assert len(rows) == 1
        assert rows[0].id == winner.id
        assert rows[0].username == "race"
        assert rows[0].password_hash == winner_hash
        assert verify_password("winning password", rows[0].password_hash)
        assert not verify_password("losing password", rows[0].password_hash)


def test_registration_nonunique_integrity_failure_propagates_after_rollback(db, settings, monkeypatch):
    """Propagate a real PostgreSQL NOT NULL error rather than a username conflict."""
    service = AuthService(db, settings)
    account = service.register(Credentials(username="original", password="unchanged"))
    original_hash = db.get(User, account.id).password_hash
    original_save = service.repo.save
    failures = []

    def save_with_missing_hash(record: User | AuthSession) -> None:
        """Inject an invalid record at save time and retain the actual SQL error."""
        record.password_hash = None
        try:
            original_save(record)
        except IntegrityError as exc:
            failures.append(exc)
            raise

    monkeypatch.setattr(service.repo, "save", save_with_missing_hash)
    with pytest.raises(IntegrityError) as caught:
        service.register(Credentials(username="invalid", password="x"))
    assert caught.value is failures[0]
    assert caught.value.orig.sqlstate == "23502"
    assert db.is_active
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.get(User, account.id).password_hash == original_hash
    assert db.scalar(select(User).where(User.username == "invalid")) is None
