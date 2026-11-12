"""Query auth records through the request's real SQLAlchemy session."""
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.auth.model import User, AuthSession


class AuthRepository:
    """Keep SQL and private persistence details below the service boundary."""

    def __init__(self, db: Session) -> None:
        """Use the caller-owned transaction and pooled connection."""
        self.db = db

    def find_username(self, username: str) -> User | None:
        """Resolve a canonical username with parameterized SQL."""
        return self.db.scalar(select(User).where(User.username == username))

    def find_user(self, user_id: UUID) -> User | None:
        """Load only the claimed account identity."""
        return self.db.get(User, user_id)

    def find_session(self, session_id: UUID) -> AuthSession | None:
        """Resolve a bearer jti against persisted session state."""
        return self.db.get(AuthSession, session_id)

    def save(self, record: User | AuthSession) -> None:
        """Commit one state transition and refresh database-generated fields."""
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
