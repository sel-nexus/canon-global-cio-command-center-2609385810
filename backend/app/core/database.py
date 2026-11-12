"""Provision a separate PostgreSQL database and share a real bounded pool."""
from collections.abc import Iterator
import psycopg
from psycopg import sql
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from fastapi import Request
from app.core.config import Settings


class Base(DeclarativeBase):
    """Collect mapped metadata for Alembic, never runtime auto-DDL."""


def database_url(settings: Settings) -> URL:
    """Compose the application database path independently of maintenance access."""
    url = make_url(settings.database_url)
    if url.get_backend_name() != "postgresql":
        raise ValueError("PostgreSQL is required")
    return url.set(drivername="postgresql+psycopg", database=settings.db_name)


def provision_database(settings: Settings) -> None:
    """Create the configured database idempotently outside a transaction.

    Raises:
        psycopg.Error: Maintenance access or provisioning is unavailable.
    """
    url = make_url(settings.database_url).set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False), autocommit=True, connect_timeout=5) as connection:
        if connection.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.db_name,)).fetchone():
            return
        try:
            connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(settings.db_name)))
        except psycopg.errors.DuplicateDatabase:
            return  # Another process completed the same provisioning operation.


def build_engine(settings: Settings) -> Engine:
    """Construct a lazy pooled engine; return connections after each request."""
    return create_engine(database_url(settings), pool_pre_ping=True,
                         pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow,
                         connect_args={"connect_timeout": 5}, hide_parameters=True)


def get_db(request: Request) -> Iterator[Session]:
    """Yield one transactional session from the application's shared pool."""
    factory: sessionmaker[Session] = request.app.state.session_factory
    with factory() as session:
        yield session


if __name__ == "__main__":
    from app.core.config import get_settings
    provision_database(get_settings())
