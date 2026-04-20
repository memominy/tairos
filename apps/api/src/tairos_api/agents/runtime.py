"""Agent executor.

``execute_run`` is the one entry-point HTTP handlers call. It:

  1. persists a ``pending`` ``AgentRun`` row,
  2. flips it to ``running``, opens the agent's async generator,
  3. persists every yielded ``Step`` to ``agent_step`` with a dense
     index,
  4. captures the ``final`` step's payload onto ``AgentRun.result``,
  5. finalises status = ``done`` or ``error`` depending on outcome.

Transactions
~~~~~~~~~~~~
Each step gets its own small transaction. If the agent crashes mid-
stream, the steps produced *before* the crash stay in the DB so the
UI can show the partial trace; only the failing step is lost.

Concurrency
~~~~~~~~~~~
Runs execute inline within the request that started them (no
background worker yet). That's fine for the dev prototype — agents
are cheap, deterministic, and return in milliseconds. When LLM-
driven agents land this becomes an ``asyncio.create_task`` dispatch
with a proper job queue.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

# See ``tools/inventory.py`` — importing the ``db`` module (rather than
# the bound ``engine`` name) lets conftest monkeypatch
# ``tairos_api.db.engine`` and have this module honour the swap at call
# time instead of capturing the production engine at import time.
from .. import db
from ..models import AgentRun, AgentStep
from .base import Agent, AgentContext, Step
from .registry import registry


def _now() -> datetime:
    return datetime.now(UTC)


def _new_run_id() -> str:
    return f"run-{uuid.uuid4()}"


def _persist_run(run: AgentRun) -> None:
    with Session(db.engine) as session:
        session.add(run)
        session.commit()


def _persist_step(run_id: str, index: int, step: Step) -> None:
    with Session(db.engine) as session:
        row = AgentStep(
            run_id=run_id,
            index=index,
            kind=step.kind,
            payload=step.payload,
        )
        session.add(row)
        session.commit()


def _update_run(run_id: str, **fields: Any) -> None:
    with Session(db.engine) as session:
        row = session.get(AgentRun, run_id)
        if row is None:
            return
        for k, v in fields.items():
            setattr(row, k, v)
        session.add(row)
        session.commit()


async def execute_run(
    agent_name: str,
    operator:   str,
    prompt:     str = "",
    context:    dict[str, Any] | None = None,
) -> AgentRun:
    """Run an agent end-to-end and return the final ``AgentRun`` row.

    Raises ``KeyError`` if the agent isn't registered.
    """
    agent_cls = registry.get_agent(agent_name)
    if agent_cls is None:
        raise KeyError(f"Unknown agent: {agent_name!r}")

    run_id = _new_run_id()
    run = AgentRun(
        id=run_id,
        agent=agent_name,
        operator=operator,
        prompt=prompt,
        context=context or {},
        status="pending",
        created_at=_now(),
    )
    _persist_run(run)

    agent = agent_cls()
    ctx = AgentContext(
        operator=operator,
        run_id=run_id,
        prompt=prompt,
        extra=context or {},
    )

    _update_run(run_id, status="running", started_at=_now())

    index = 0
    final_payload: dict[str, Any] | None = None
    try:
        async for step in _iter(agent.arun(ctx)):
            _persist_step(run_id, index, step)
            index += 1
            if step.kind == "final":
                final_payload = step.payload
        if final_payload is None:
            raise RuntimeError("Agent generator closed without a final step")
    except Exception as exc:
        _update_run(run_id, status="error", error=str(exc)[:500], ended_at=_now())
        raise

    _update_run(
        run_id,
        status="done",
        result=final_payload,
        ended_at=_now(),
    )

    # Reload the fresh row so callers see every audit column populated.
    with Session(db.engine) as session:
        fresh = session.get(AgentRun, run_id)
        assert fresh is not None
        return fresh


async def _iter(gen: AsyncIterator[Step]) -> AsyncIterator[Step]:
    """Pass-through async-iterator — exists only as an extension point
    for future instrumentation (timing, rate limits, step caching)."""
    async for step in gen:
        yield step
