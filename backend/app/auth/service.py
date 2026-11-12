"""Enforce credential validation and persisted session authorization."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.auth.model import User, AuthSession
from app.auth.repository import AuthRepository
from app.auth.schema import Credentials, Account, LoginResponse
from app.core.config import Settings
from app.core.security import hash_password, verify_password, issue_token, decode_token


class DuplicateUsername(ValueError):
    """Signal a canonical username conflict without changing existing credentials."""


class InvalidCredentials(ValueError):
    """Hide whether the username, password or bearer session was invalid."""


class AuthService:
    """Own auth state transitions while leaving connections to dependency injection."""

    def __init__(self, db: Session, settings: Settings) -> None:
        """Bind a repository and explicit signing configuration."""
        self.repo = AuthRepository(db)
        self.settings = settings

    def register(self, credentials: Credentials) -> Account:
        """Persist a salted hash and reject both sequential and concurrent duplicates."""
        if self.repo.find_username(credentials.username):
            raise DuplicateUsername("Username already exists")
        user = User(username=credentials.username, password_hash=hash_password(credentials.password))
        try:
            self.repo.save(user)
        except IntegrityError as exc:
            self.repo.db.rollback()
            if getattr(exc.orig, "sqlstate", None) == "23505":
                raise DuplicateUsername("Username already exists") from exc
            raise
        return Account.model_validate(user)

    def login(self, credentials: Credentials) -> LoginResponse:
        """Issue a signed token only after the exact password matches a saved hash."""
        user = self.repo.find_username(credentials.username)
        # Spend bcrypt work even on missing accounts to reduce username timing disclosure.
        dummy_hash = hash_password("unmatched-account")
        stored = user.password_hash if user else dummy_hash
        valid = verify_password(credentials.password, stored)
        if not user or not valid:
            raise InvalidCredentials("Invalid credentials")
        session = AuthSession(id=uuid4(), user_id=user.id,
                              expires_at=datetime.now(timezone.utc) + timedelta(minutes=self.settings.access_token_minutes))
        token = issue_token(user.id, session.id, session.expires_at, self.settings)
        self.repo.save(session)
        return LoginResponse(access_token=token, account=Account.model_validate(user))

    def authenticate(self, token: str) -> tuple[User, AuthSession]:
        """Reject forged, missing, expired, revoked or mismatched persisted sessions."""
        try:
            user_id, session_id = decode_token(token, self.settings)
        except ValueError as exc:
            raise InvalidCredentials("Invalid credentials") from exc
        session = self.repo.find_session(session_id)
        if (not session or session.user_id != user_id or session.revoked_at is not None
                or session.expires_at <= datetime.now(timezone.utc)):
            raise InvalidCredentials("Invalid credentials")
        user = self.repo.find_user(user_id)
        if not user:
            raise InvalidCredentials("Invalid credentials")
        return user, session

    def logout(self, token: str) -> None:
        """Revoke only the current bearer session without deleting the account."""
        _, session = self.authenticate(token)
        session.revoked_at = datetime.now(timezone.utc)
        self.repo.save(session)

    def seed(self) -> None:
        """Idempotently create the optional development account without resetting it."""
        if not self.settings.seed_on_startup:
            return
        credentials = Credentials(username=self.settings.seed_username,
                                  password=self.settings.seed_password.get_secret_value())
        try:
            self.register(credentials)
        except DuplicateUsername:
            return
