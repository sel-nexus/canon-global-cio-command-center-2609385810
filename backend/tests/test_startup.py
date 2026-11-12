"""Exercise fresh and repeated startup using only lifespan-owned PostgreSQL migrations."""
from collections.abc import Iterator
import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

from app.core.config import Settings, get_settings
from app.main import create_app


@pytest.fixture
def fresh_startup_settings() -> Iterator[Settings]:
    """Reserve a nonexistent database and remove only that database after the test."""
    original = get_settings()
    name = f"canon_startup_test_{uuid4().hex[:12]}"
    configuration = original.model_copy(update={
        "database_url": os.getenv("TEST_DATABASE_URL", original.database_url),
        "db_name": name,
        "seed_username": "startup-test-user",
    })
    maintenance_url = make_url(configuration.database_url).set(drivername="postgresql")
    with psycopg.connect(maintenance_url.render_as_string(hide_password=False),
                         autocommit=True, connect_timeout=5) as connection:
        assert connection.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (name,)
        ).fetchone() is None
        try:
            yield configuration
        finally:
            connection.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                sql.Identifier(name)
            ))


@pytest.mark.parametrize("seed_on_startup", [False, True])
def test_fresh_startup_migrates_and_repeated_startup_disposes_pool(
    fresh_startup_settings: Settings, seed_on_startup: bool,
) -> None:
    """Create account/history tables before seed and preserve them across clean shutdowns."""
    configuration = fresh_startup_settings.model_copy(update={"seed_on_startup": seed_on_startup})
    application = create_app(configuration)
    environment = {key: os.environ.get(key) for key in ("DB_NAME", "DATABASE_URL")}
    migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    heads = set(ScriptDirectory.from_config(migration_config).get_heads())
    first_users = None

    for _ in range(2):
        with TestClient(application) as client:
            assert client.get("/api/health").json() == {"status": "ok"}
            engine = application.state.session_factory.kw["bind"]
            pool = engine.pool
            assert engine.url.database == configuration.db_name
            assert {"users", "sessions", "assistant_messages", "alembic_version"} <= set(
                inspect(engine).get_table_names()
            )
            with engine.connect() as connection:
                assert set(connection.execute(text(
                    "SELECT version_num FROM alembic_version"
                )).scalars()) == heads
                users = connection.execute(text(
                    "SELECT id, username FROM users ORDER BY username"
                )).all()
                assert len(users) == int(seed_on_startup)
                if seed_on_startup:
                    assert users[0].username == configuration.seed_username
                assert connection.execute(text("SELECT count(*) FROM sessions")).scalar_one() == 0
                assert connection.execute(text(
                    "SELECT count(*) FROM assistant_messages"
                )).scalar_one() == 0
            if first_users is None:
                first_users = users
            else:
                assert users == first_users
            assert pool.checkedout() == 0
            assert pool.checkedin() > 0
        assert engine.pool is not pool
        assert pool.checkedin() == 0
        assert environment == {key: os.environ.get(key) for key in environment}
