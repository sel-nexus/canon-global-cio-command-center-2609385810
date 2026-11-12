"""Create account credentials and revocable session tables."""
from alembic import op
import sqlalchemy as sa

revision = "001_accounts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Install UUID identities, aware lifetimes and account/session integrity."""
    op.create_table("users",
                    sa.Column("id", sa.Uuid(), primary_key=True),
                    sa.Column("username", sa.String(100), nullable=False),
                    sa.Column("password_hash", sa.String(100), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
                    sa.UniqueConstraint("username", name="uq_users_username"))
    op.create_table("sessions",
                    sa.Column("id", sa.Uuid(), primary_key=True),
                    sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
                    sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    """Remove sessions before accounts to respect their ownership constraint."""
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("users")
