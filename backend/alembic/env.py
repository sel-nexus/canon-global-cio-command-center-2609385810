"""Run migrations against the configured application database, not maintenance."""
from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from app.core.config import get_settings
from app.core.database import Base, build_engine, database_url
from app.auth.model import User, AuthSession
from app.assistant.model import AssistantMessage

config = context.config
explicit_url = config.attributes.get("database_url")
settings = get_settings() if explicit_url is None else None
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Render reviewed SQL without opening a database connection."""
    url = explicit_url if explicit_url is not None else database_url(settings)
    context.configure(url=url,
                      target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply each version in a transaction using a temporary pooled engine."""
    engine = (build_engine(settings) if explicit_url is None else
              create_engine(explicit_url, poolclass=NullPool,
                            connect_args={"connect_timeout": 5}, hide_parameters=True))
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
