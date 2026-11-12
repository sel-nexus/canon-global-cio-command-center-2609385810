"""Use Alembic and a unique disposable PostgreSQL database, never dev data."""
from collections.abc import Iterator, AsyncIterator
import os
from uuid import uuid4
import psycopg
from psycopg import sql
import pytest
import httpx
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session
from app.core.config import Settings, get_settings
from app.core.database import provision_database, build_engine
from app.main import create_app


@pytest.fixture(scope="session")
def settings() -> Iterator[Settings]:
    """Provision an isolated test database and remove only that database afterward."""
    original = get_settings()
    prefix = os.getenv("TEST_DB_NAME", "canon_history_test")
    if "test" not in prefix.lower():
        raise ValueError("TEST_DB_NAME must contain test")
    name = f"{prefix[:35]}_{uuid4().hex[:12]}"
    configuration = original.model_copy(update={
        "database_url": os.getenv("TEST_DATABASE_URL", original.database_url),
        "db_name": name, "seed_on_startup": False,
    })
    provision_database(configuration)
    previous = os.environ.get("DB_NAME")
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DB_NAME"] = name
    os.environ["DATABASE_URL"] = configuration.database_url
    get_settings.cache_clear()
    try:
        command.upgrade(Config("alembic.ini"), "head")
        yield configuration
    finally:
        if previous is None:
            os.environ.pop("DB_NAME", None)
        else:
            os.environ["DB_NAME"] = previous
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
        get_settings.cache_clear()
        from sqlalchemy.engine import make_url
        url = make_url(configuration.database_url).set(drivername="postgresql")
        with psycopg.connect(url.render_as_string(hide_password=False), autocommit=True) as connection:
            connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


@pytest.fixture
def db(settings: Settings) -> Iterator[Session]:
    """Rollback each test's real database writes, including service commit calls."""
    engine = build_engine(settings)
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False) as session:
            yield session
        transaction.rollback()
    engine.dispose()


@pytest.fixture
async def client(db: Session, settings: Settings) -> AsyncIterator[httpx.AsyncClient]:
    """Exercise real HTTP handlers against the isolated PostgreSQL transaction."""
    from app.core.database import get_db
    application = create_app(settings)

    def override_db() -> Iterator[Session]:
        """Share the test-owned transaction with serial in-process requests."""
        yield db

    application.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application), base_url="http://test") as connection:
        yield connection
    application.dependency_overrides.clear()
