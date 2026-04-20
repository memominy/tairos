"""Tairos inventory node — the backend mirror of the frontend's
``tairosNodes`` store slice.

The frontend has been persisting nodes to ``localStorage`` per-operator
for a while. This table is the first durable landing spot: eventually
the frontend will stop writing to localStorage and read/write here via
TanStack Query. For now the two can coexist — the migration job
(implemented in a later step) ingests each operator's localStorage
dump into this table on first API connect.

Column choices
--------------
* ``id`` is a client-generated string. The frontend already uses UUID
  strings; forcing a server-side integer id would break the
  round-tripping story during migration.
* ``operator`` is a 2-letter country/force code
  (``TR``, ``US``, ``RU``…) — matches ``packages/shared/operators.js``.
  Kept as plain VARCHAR + an index so queries like
  "all nodes for operator=TR" are O(log n) from day one.
* ``lat`` / ``lng`` are stored as ``Float`` — SQLite's REAL affinity.
  When SpatiaLite is enabled an alembic migration can add a
  ``GEOMETRY`` column populated from these on write; until then the
  scalar columns are authoritative.
* ``extra`` is a JSON-as-TEXT free-form dict. Most fields from the
  frontend node record land here (product attachments, group
  membership, area metadata) so we don't have to migrate the schema
  every time the UI grows a new sub-field.
* ``created_at`` / ``updated_at`` are server-side timestamps, stored
  in UTC. The ``updated_at`` column is maintained by a SQLAlchemy
  event in this module — SQLite has no native ``ON UPDATE`` clause.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, event
from sqlalchemy.orm import Mapper
from sqlmodel import Field, SQLModel


class NodeBase(SQLModel):
    """Shared fields — used by both the table and the I/O schemas."""

    operator: str = Field(index=True, max_length=4)
    name:     str = Field(max_length=120)
    lat:      float
    lng:      float
    # JSON blob for anything the schema doesn't pin down yet.
    # Typed as ``dict[str, Any]`` so consumers can drop arbitrary
    # payloads without schema migrations; we only reach into it
    # when a dedicated column is eventually promoted.
    extra: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class Node(NodeBase, table=True):
    """Table model — adds the primary key + audit columns."""

    id: str = Field(primary_key=True, max_length=64)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NodeCreate(NodeBase):
    """Request body for POST /nodes — id optional (server fills if absent)."""

    id: str | None = None


class NodeUpdate(SQLModel):
    """Partial update — every field optional so the client can PATCH."""

    operator: str | None = None
    name:     str | None = None
    lat:      float | None = None
    lng:      float | None = None
    extra:    dict[str, Any] | None = None


class NodeRead(NodeBase):
    """Response body — adds the primary key + audit columns."""

    id: str
    created_at: datetime
    updated_at: datetime


# SQLite doesn't honour ``onupdate=func.now()`` the way Postgres does
# for every update path, so bump ``updated_at`` explicitly in a
# before-update listener. Keeps the column honest regardless of
# whether the caller touched it.
@event.listens_for(Node, "before_update")
def _touch_updated_at(_mapper: Mapper, _connection: Any, target: Node) -> None:  # pragma: no cover
    target.updated_at = datetime.now(UTC)
