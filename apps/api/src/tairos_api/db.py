"""SQLModel engine + session plumbing.

Two responsibilities live here:

1. **Engine construction.** A single ``Engine`` is created from
   ``Settings.database_url``. We hook ``connect`` on the underlying
   SQLAlchemy event bus so every new SQLite connection gets:
     * ``PRAGMA foreign_keys=ON`` — SQLite disables FK enforcement by
       default, which silently corrupts referential integrity.
     * ``PRAGMA journal_mode=WAL`` — multi-reader durability without
       blocking readers behind writers; huge win for a single-node
       FastAPI process serving the frontend.
     * optional SpatiaLite extension loading if ``SPATIALITE_PATH``
       is configured. When the extension is absent we never call
       ``load_extension`` at all, so the backend starts cleanly on
       a stock Python install.

2. **Session dependency.** ``get_session`` is the FastAPI dependency
   that yields a scoped ``Session`` and guarantees cleanup on both
   the success and exception paths.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from .config import Settings, get_settings


def _sqlite_path_from_url(url: str) -> Path | None:
    """Return the filesystem path for a SQLite URL, or None otherwise."""
    if not url.startswith("sqlite"):
        return None
    # sqlite:///relative/path  |  sqlite:////abs/path
    after = url.split("sqlite:///", 1)[-1]
    return Path(after) if after else None


def _attach_sqlite_pragmas(engine: Engine, settings: Settings) -> None:
    """Install a connect listener that sets per-connection SQLite pragmas
    and (optionally) loads the SpatiaLite extension.

    The listener runs on every new raw DBAPI connection the pool opens,
    which is what we want: pragmas are per-connection in SQLite.
    """

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _connection_record) -> None:  # pragma: no cover
        cursor = dbapi_conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()

        if settings.spatialite_path:
            # SQLite requires ``enable_load_extension`` before
            # ``load_extension`` can run. The Python sqlite3 bindings
            # gate this behind a call instead of a pragma.
            try:
                dbapi_conn.enable_load_extension(True)
                dbapi_conn.load_extension(settings.spatialite_path)
                dbapi_conn.enable_load_extension(False)
            except Exception:
                # Missing DLL / wrong arch / locked file — don't crash
                # the server. Spatial endpoints will return 501 until
                # the operator fixes the path; non-spatial endpoints
                # keep working.
                pass


def build_engine(settings: Settings) -> Engine:
    """Create the SQLAlchemy engine and install our pragma listener.

    Split out from module import so tests can build an isolated
    in-memory engine without touching the global one.
    """
    sqlite_path = _sqlite_path_from_url(settings.database_url)
    if sqlite_path is not None:
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)

    # ``check_same_thread=False`` is standard for FastAPI + SQLite:
    # the single connection pool is shared across the (async) worker's
    # threadpool, and we rely on SQLite's own per-connection locking.
    engine = create_engine(
        settings.database_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
    _attach_sqlite_pragmas(engine, settings)
    return engine


# A module-level engine is fine: FastAPI apps are singletons per
# process and we want one connection pool, not one per request.
engine: Engine = build_engine(get_settings())


def create_db_and_tables() -> None:
    """Create any tables declared on ``SQLModel.metadata``.

    Used by dev/test bootstrap and the alembic offline path. In
    production alembic migrations are authoritative; this function
    is a convenience, not the migration mechanism.
    """
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency — yields a session bound to the global engine.

    Usage:

        @router.get("/...")
        def endpoint(session: Session = Depends(get_session)):
            ...
    """
    with Session(engine) as session:
        yield session
