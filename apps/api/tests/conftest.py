"""Test fixtures — isolated in-memory DB + overridden session dependency.

Every test module gets a fresh SQLite ``:memory:`` engine and an
``AsyncClient`` bound to a FastAPI app whose ``get_session`` dependency
is overridden to hand out sessions from that memory DB. Tests never
touch the on-disk ``apps/api/.data`` file.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from tairos_api import db as db_module
from tairos_api.db import get_session
from tairos_api.main import create_app


@pytest.fixture(name="engine")
def engine_fixture(monkeypatch: pytest.MonkeyPatch):
    """Fresh in-memory SQLite engine, swapped in for the module-level
    ``tairos_api.db.engine`` for the duration of the test.

    Code paths that go through the FastAPI ``get_session`` dependency
    are handled by the override below, but the agent runtime + inventory
    tools read ``db.engine`` directly (see inline comment in
    ``agents/runtime.py``). Monkeypatching the module attribute means
    *every* caller — dependency-injected or not — sees the same memory
    DB for the life of the test.
    """
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(db_module, "engine", eng)
    return eng


@pytest.fixture(name="session")
def session_fixture(engine) -> Iterator[Session]:
    # StaticPool makes every checkout return the same underlying
    # connection, which is what ``sqlite:///:memory:`` needs to keep
    # the schema alive across SQLModel's session boundaries.
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
async def client_fixture(session: Session) -> AsyncIterator[AsyncClient]:
    app = create_app()

    def _override() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = _override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
