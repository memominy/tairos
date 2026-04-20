"""Agent persistence models — runs + steps.

Two-table design:

* ``agent_run`` — one row per invocation. Captures the agent name,
  the initial prompt, the operator context, timing, and the terminal
  status. The agent's `final` step payload lives here too under
  ``result`` so a run-detail UI doesn't need to join the steps table
  for the headline answer.

* ``agent_step`` — append-only timeline. Each row carries ``kind``
  (plan | tool_call | tool_result | final), a sequential ``index``
  within the run, and a ``payload`` JSON blob whose shape depends on
  kind. Keeping the blob free-form lets us add tool categories
  (retrieval, action, verification, …) without schema migrations.

We deliberately index ``(run_id, index)`` so timeline reads are one
SQLite B-tree seek.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_run"

    id:    str = Field(primary_key=True, max_length=64)
    agent: str = Field(index=True, max_length=64)

    # Operator scope — keeps inventory-analyst runs separated per
    # operator at storage time, not just at query time.
    operator: str = Field(index=True, max_length=4)

    # Free-form request input; whatever the agent accepts.
    prompt: str = Field(default="")
    context: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    status:     str  = Field(default="pending", index=True, max_length=16)
    # ^ pending | running | done | error

    result:     dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    error:      str | None = Field(default=None, max_length=500)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = Field(default=None)
    ended_at:   datetime | None = Field(default=None)


class AgentStep(SQLModel, table=True):
    __tablename__ = "agent_step"

    id:      int    = Field(default=None, primary_key=True)
    run_id:  str    = Field(foreign_key="agent_run.id", index=True, max_length=64)

    # Dense sequential index within a run. Set by the runtime, not
    # the caller, so the timeline order is authoritative.
    index:   int

    kind:    str    = Field(max_length=16)
    # ^ plan | tool_call | tool_result | final

    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
