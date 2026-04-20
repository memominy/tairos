"""Tests for the frontend → backend inventory seed script.

Uses a temporary JSON source and a temp SQLite file so the real
frontend data and the dev DB are both untouched.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from tairos_api.models import Node

# Import the seed module late so we can monkeypatch its engine/session
# bindings to point at our temp DB. Importing by dotted path means
# the import stays resilient to refactors of the ``scripts/`` layout.
SEED_MOD = "scripts.seed_nodes_from_frontend"


@pytest.fixture
def source_file(tmp_path: Path) -> Path:
    path = tmp_path / "nodes.json"
    path.write_text(json.dumps([
        {"id": "tn-a", "name": "Node A", "lat": 39.0, "lng": 35.0,
         "city": "X", "status": "planned", "info": "first"},
        {"id": "tn-b", "name": "Node B", "lat": 38.5, "lng": 34.5,
         "city": "Y", "status": "active",  "info": "second"},
    ]), encoding="utf-8")
    return path


@pytest.fixture
def temp_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the seed script at an isolated on-disk SQLite DB."""
    import importlib

    db_path = tmp_path / "seed-test.sqlite"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}",
                           connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    mod = importlib.import_module(SEED_MOD)
    monkeypatch.setattr(mod, "engine", engine, raising=True)
    return engine


def test_seed_inserts_all_rows_first_run(source_file, temp_engine):
    import importlib
    mod = importlib.import_module(SEED_MOD)

    inserted, skipped = mod.seed(source_file)
    assert (inserted, skipped) == (2, 0)

    with Session(temp_engine) as session:
        rows = session.exec(select(Node)).all()
        assert {n.id for n in rows} == {"tn-a", "tn-b"}
        assert all(n.operator == "TR" for n in rows)
        # extras round-trip
        a = next(n for n in rows if n.id == "tn-a")
        assert a.extra["city"] == "X"
        assert a.extra["status"] == "planned"
        assert a.extra["info"] == "first"


def test_seed_is_idempotent(source_file, temp_engine):
    import importlib
    mod = importlib.import_module(SEED_MOD)

    mod.seed(source_file)
    inserted, skipped = mod.seed(source_file)  # second run
    assert (inserted, skipped) == (0, 2)


def test_seed_inserts_only_new_rows(source_file, temp_engine, tmp_path: Path):
    import importlib
    mod = importlib.import_module(SEED_MOD)

    mod.seed(source_file)

    # Add a third entry to the source and re-run — only the new one
    # should be inserted.
    bigger = tmp_path / "nodes-2.json"
    bigger.write_text(json.dumps([
        {"id": "tn-a", "name": "Node A", "lat": 0, "lng": 0},
        {"id": "tn-b", "name": "Node B", "lat": 0, "lng": 0},
        {"id": "tn-c", "name": "Node C", "lat": 1, "lng": 1,
         "city": "Z", "status": "planned", "info": "third"},
    ]), encoding="utf-8")
    inserted, skipped = mod.seed(bigger)
    assert (inserted, skipped) == (1, 2)
