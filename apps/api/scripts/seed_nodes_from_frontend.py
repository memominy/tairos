"""One-shot ingestion: ``apps/web/src/data/tairos-nodes.json`` → ``node`` table.

Idempotent: entries whose ``id`` already exists in the table are
skipped, so re-running the script after edits to the source JSON is
safe — it'll only insert the new rows and leave existing records
alone. Delete-through-truncate is NOT implemented here on purpose:
if you need to rewrite the whole slice, drop the ``node`` table via
``alembic downgrade base`` and re-run ``upgrade head``.

Assumptions
-----------
* Every node in the source JSON is TR-operator inventory. The file
  pre-dates operator scoping; when inventory gets truly multi-operator
  the UI will write to the backend directly and this script becomes
  a museum piece.
* Source shape per entry:
    ``{ id, name, lat, lng, city, status, info }``
  ``city``, ``status``, and ``info`` go into the ``extra`` JSON blob —
  they're not first-class columns on the backend because the frontend
  mutates them freely.

Usage (from ``apps/api/``, with the venv active)::

    python -m scripts.seed_nodes_from_frontend

    # or point at a specific source file:
    python -m scripts.seed_nodes_from_frontend ../web/src/data/tairos-nodes.json
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

# Resolve the default frontend path from here: apps/api/scripts → apps/web/src/data
DEFAULT_SOURCE = Path(__file__).resolve().parents[2] / "web" / "src" / "data" / "tairos-nodes.json"

# ``tairos_api`` lives at ``apps/api/src/tairos_api`` — the venv's
# editable install puts it on sys.path already, but support running
# without the install by appending src/ manually.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tairos_api.db import create_db_and_tables, engine  # noqa: E402
from tairos_api.models import Node                      # noqa: E402

TR_OPERATOR = "TR"


def _load_rows(source: Path) -> list[dict[str, Any]]:
    with source.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {source}, got {type(data).__name__}")
    return data


def _to_node(row: dict[str, Any]) -> Node:
    return Node(
        id=row["id"],
        operator=TR_OPERATOR,
        name=row["name"],
        lat=float(row["lat"]),
        lng=float(row["lng"]),
        extra={
            "city":   row.get("city"),
            "status": row.get("status"),
            "info":   row.get("info"),
            "source": "frontend-seed:tairos-nodes.json",
        },
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def seed(source: Path = DEFAULT_SOURCE) -> tuple[int, int]:
    """Insert any rows that don't already exist. Returns (inserted, skipped)."""
    if not source.exists():
        raise SystemExit(f"Source file not found: {source}")

    rows = _load_rows(source)

    create_db_and_tables()  # cheap no-op if alembic already ran.

    inserted = 0
    skipped  = 0
    with Session(engine) as session:
        # Pull the full Node rows and project to a set of ids. Using
        # ``select(Node.id)`` directly trips over SQLModel's scalar-vs-
        # tuple result shape across versions — iterating full objects
        # is boring but robust.
        existing_ids = {n.id for n in session.exec(select(Node)).all()}
        for row in rows:
            if row["id"] in existing_ids:
                skipped += 1
                continue
            session.add(_to_node(row))
            inserted += 1
        session.commit()

    return inserted, skipped


def main() -> None:
    source = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_SOURCE
    inserted, skipped = seed(source)
    print(f"[seed_nodes_from_frontend] source={source}")
    print(f"[seed_nodes_from_frontend] inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    main()
