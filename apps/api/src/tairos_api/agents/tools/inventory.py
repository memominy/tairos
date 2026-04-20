"""Inventory-facing Tools.

These are deliberately minimal — they only read the Node table. An
agent that needs to *modify* inventory would use a different tool
family (to be written when a migrated-to-backend UI exists).

All tools respect the ``ctx.operator`` scope: the frontend never
implicitly cross-references operators, and neither should an agent.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import Session, select

# Import the db module (not the bound name) so tests that monkeypatch
# ``tairos_api.db.engine`` are honoured at call time. A direct
# ``from ...db import engine`` would capture the engine reference at
# import time and ignore the patch.
from ... import db
from ...models import Node
from ..tool import Tool, ToolContext


# ─────────────────────────────────────────────────────────────
# list_nodes
# ─────────────────────────────────────────────────────────────
class ListNodesInput(BaseModel):
    limit: int = Field(default=50, ge=1, le=500, description="Max rows to return")


class ListNodesOutput(BaseModel):
    nodes: list[dict[str, Any]]
    total: int


class ListNodesTool(Tool):
    name          = "list_nodes"
    description   = "List inventory nodes for the current operator, up to `limit` rows."
    input_schema  = ListNodesInput
    output_schema = ListNodesOutput

    async def run(self, payload: ListNodesInput, ctx: ToolContext) -> dict[str, Any]:
        with Session(db.engine) as session:
            stmt = (
                select(Node)
                .where(Node.operator == ctx.operator)
                .order_by(Node.created_at.desc())
                .limit(payload.limit)
            )
            rows = session.exec(stmt).all()
            # Count is cheap; worth emitting so the caller can show
            # "showing 50 of 312" without a second round-trip.
            total = session.exec(
                select(Node).where(Node.operator == ctx.operator)
            ).all()
            return {
                "nodes": [
                    {
                        "id":   n.id,
                        "name": n.name,
                        "lat":  n.lat,
                        "lng":  n.lng,
                        "extra": n.extra,
                    }
                    for n in rows
                ],
                "total": len(total),
            }


# ─────────────────────────────────────────────────────────────
# count_nodes
# ─────────────────────────────────────────────────────────────
class CountNodesInput(BaseModel):
    # Optional filter — e.g. "status=active" against the extra blob.
    # Kept coarse intentionally: agents that need richer querying
    # can use list_nodes and filter client-side.
    pass


class CountNodesOutput(BaseModel):
    total: int


class CountNodesTool(Tool):
    name          = "count_nodes"
    description   = "Return the total node count for the current operator."
    input_schema  = CountNodesInput
    output_schema = CountNodesOutput

    async def run(self, payload: CountNodesInput, ctx: ToolContext) -> dict[str, Any]:
        with Session(db.engine) as session:
            rows = session.exec(
                select(Node).where(Node.operator == ctx.operator)
            ).all()
            return {"total": len(rows)}
