"""Remove exactly one browser-run database through its configured maintenance connection."""
import os
import re


def main() -> None:
    """Validate isolation before connecting; fail visibly rather than dropping another database."""
    import psycopg
    from psycopg import sql
    from sqlalchemy.engine import make_url

    name = os.environ["BROWSER_TEST_DATABASE"]
    if len(name) > 63 or not re.fullmatch(r"canon_browser_test(?:_[a-z0-9]+)*_[a-f0-9]{12}", name):
        raise ValueError("Refusing to drop a non-browser-test database")
    url = make_url(os.environ["BROWSER_TEST_MAINTENANCE_URL"])
    if url.get_backend_name() != "postgresql" or url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Browser teardown requires local PostgreSQL maintenance access")
    if not url.database or url.database == name:
        raise ValueError("Maintenance connection must use a different database")
    with psycopg.connect(url.set(drivername="postgresql").render_as_string(hide_password=False),
                         autocommit=True, connect_timeout=5) as connection:
        # Teardown may precede managed-server shutdown; FORCE affects only this unique database.
        connection.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


if __name__ == "__main__":
    main()
