"""Map response-only history to PostgreSQL with enforced account ownership."""
import datetime
from uuid import UUID, uuid4
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AssistantMessage(Base):
    """Persist only a deterministic assistant response, never its source prompt."""

    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint("role = 'assistant'", name="ck_assistant_messages_role"),
        Index("ix_assistant_messages_user_created", "user_id", "created_at", "id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="assistant", nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc),
        server_default=func.now(), nullable=False)
