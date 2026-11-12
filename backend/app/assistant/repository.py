"""Keep owner-scoped SQL and response persistence below the service boundary."""
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.assistant.model import AssistantMessage


class AssistantRepository:
    """Use the request-owned real PostgreSQL transaction and pooled connection."""

    def __init__(self, db: Session) -> None:
        """Bind the caller's session without allocating an alternate store."""
        self.db = db

    def save(self, user_id: UUID, text: str) -> AssistantMessage:
        """Commit a response and rollback any failed write before propagating it."""
        record = AssistantMessage(user_id=user_id, role="assistant", text=text)
        try:
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
        except SQLAlchemyError:
            self.db.rollback()
            raise
        return record

    def history(self, user_id: UUID, limit: int, offset: int) -> tuple[list[AssistantMessage], int]:
        """Read only the authorized owner, ordering timestamp ties by UUID."""
        query = select(AssistantMessage).where(AssistantMessage.user_id == user_id)
        items = list(self.db.scalars(query.order_by(AssistantMessage.created_at, AssistantMessage.id)
                                     .limit(limit).offset(offset)))
        total = self.db.scalar(select(func.count()).select_from(AssistantMessage)
                               .where(AssistantMessage.user_id == user_id))
        return items, total or 0
