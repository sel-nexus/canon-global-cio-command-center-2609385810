"""Create response-only assistant history with account ownership and query indexes."""
from alembic import op
import sqlalchemy as sa

revision = "002_history"
down_revision = "001_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Install UUID history, aware creation times and cascading owner integrity."""
    op.create_table("assistant_messages",
                    sa.Column("id", sa.Uuid(), primary_key=True),
                    sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("role", sa.String(20), nullable=False),
                    sa.Column("text", sa.Text(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
                    sa.CheckConstraint("role = 'assistant'", name="ck_assistant_messages_role"))
    op.create_index("ix_assistant_messages_user_id", "assistant_messages", ["user_id"])
    op.create_index("ix_assistant_messages_user_created", "assistant_messages", ["user_id", "created_at", "id"])


def downgrade() -> None:
    """Remove history indexes and rows without changing accounts or sessions."""
    op.drop_index("ix_assistant_messages_user_created", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_user_id", table_name="assistant_messages")
    op.drop_table("assistant_messages")
