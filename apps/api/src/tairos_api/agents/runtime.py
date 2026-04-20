"""Agent executor.

``execute_run`` is the one entry-point HTTP handlers call. It:

  1. persists a ``pending`` ``AgentRun`` row,
  2. dispatches on ``agent.kind``:
     - deterministic  → runs to completion inline (sub-millisecond,
       no need to burn an async task on it),
     - llm / everything else → schedules ``_run_to_completion`` as a
       background ``asyncio`` task and returns the pending row
       immediately. Callers (both HTTP clients and the frontend)
       poll ``GET /v1/agents/runs/{id}`` until the status reaches
       ``done`` / ``error`` / ``cancelled``.
  3. returns the row — terminal for sync, pending for async.

Why not always go async?
~~~~~~~~~~~~~~~~~~~~~~~~
Two reasons to keep the sync path for deterministic agents:
  * the existing tests (and any UI that doesn't poll yet) keep
    working unchanged,
  * the mental model is "async only when it actually benefits the
    user" — a 2ms inventory summary doesn't need a pending→done
    dance.

When a deterministic agent eventually takes long enough to warrant
the same treatment, flip its ``kind`` field and the dispatcher picks
up the new route — no caller changes required.

Transactions
~~~~~~~~~~~~
Each step gets its own small transaction. If the agent crashes mid-
stream, the steps produced *before* the crash stay in the DB so the
UI can show the partial trace; only the failing step is lost.

Background task lifetime
~~~~~~~~~~~~~~~~~~~~~~~~
We keep a strong reference to every task we spawn in
``_background_tasks`` so Python's GC doesn't collect the coroutine
mid-run (per the asyncio docs). The set is pruned by a done-callback
so long-running processes don't leak references.

Cancellation
~~~~~~~~~~~~
``cancel_run`` looks the task up in ``_run_tasks`` (same lifecycle as
``_background_tasks`` but keyed by run_id) and ``task.cancel()``s it.
Cancellation is cooperative — it fires at the next ``await`` point.
The task's own ``except asyncio.CancelledError`` branch writes
``status=cancelled`` before the task unwinds. Orphan rows (API restart
mid-run, race between task exit and cancel request) get flipped to
cancelled directly so the UI never polls a dangling pending row.
"""
from __future__ import annotations

import asyncio
import logging
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


_log = logging.getLogger(__name__)


# Module-level task registry — see module docstring.
_background_tasks: set[asyncio.Task[Any]] = set()

# Indexed by run_id so ``cancel_run`` can find the right task without
# scanning the set. Populated on ``execute_run`` for async dispatch,
# pruned by the done-callback the same moment ``_background_tasks`` is.
# Deterministic runs never enter here (they finish inline, there's
# nothing to cancel after the function returns).
_run_tasks: dict[str, asyncio.Task[Any]] = {}


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


def _reload_run(run_id: str) -> AgentRun:
    """Fetch a fresh copy of a persisted run — used so callers see
    the post-commit audit columns (started_at, result, ...) instead
    of the in-memory row they handed us at ``_persist_run`` time."""
    with Session(db.engine) as session:
        fresh = session.get(AgentRun, run_id)
        assert fresh is not None, f"Run {run_id!r} vanished between persist and reload"
        return fresh


# ── Public entry-point ───────────────────────────────────────────
async def execute_run(
    agent_name: str,
    operator:   str,
    prompt:     str = "",
    context:    dict[str, Any] | None = None,
) -> AgentRun:
    """Start an agent run. Returns:

      * a **terminal** ``AgentRun`` for deterministic agents (status
        is ``done`` or ``error`` — the run has fully executed),
      * a **pending** ``AgentRun`` for LLM / long-running agents
        (the row is persisted and a background task drives it to
        completion; poll ``GET /v1/agents/runs/{id}`` to tail).

    Raises ``KeyError`` if the agent isn't registered.
    """
    agent_cls = registry.get_agent(agent_name)
    if agent_cls is None:
        raise KeyError(f"Unknown agent: {agent_name!r}")

    run_id = _new_run_id()
    pending = AgentRun(
        id=run_id,
        agent=agent_name,
        operator=operator,
        prompt=prompt,
        context=context or {},
        status="pending",
        created_at=_now(),
    )
    _persist_run(pending)

    kind = getattr(agent_cls, "kind", "deterministic")
    if kind == "deterministic":
        # Run inline — the HTTP handler returns the finished row with
        # no round-trip asymmetry for the caller.
        return await _run_to_completion(agent_cls, run_id, operator, prompt, context or {})

    # Everything else (today: llm) goes async. The task writes
    # progress to the DB as it runs; the caller polls for terminal
    # state. We return the pending row immediately so the HTTP
    # response comes back in milliseconds even on a 20-second LLM
    # conversation.
    task = asyncio.create_task(
        _run_to_completion_safe(agent_cls, run_id, operator, prompt, context or {}),
        name=f"agent-run:{run_id}",
    )
    _background_tasks.add(task)
    _run_tasks[run_id] = task
    def _on_done(t: asyncio.Task[Any], _rid: str = run_id) -> None:
        _background_tasks.discard(t)
        # pop() over del so a double-fire (shouldn't happen, but
        # asyncio's done-callback semantics are explicit "call zero or
        # one times") never raises KeyError and takes the whole loop
        # with it.
        _run_tasks.pop(_rid, None)
    task.add_done_callback(_on_done)

    return _reload_run(run_id)


# ── Cancellation ─────────────────────────────────────────────────
def cancel_run(run_id: str) -> AgentRun | None:
    """Request cancellation of an in-flight run.

    Returns the refreshed row, or ``None`` if no row exists for ``run_id``.
    Behaviour by current state:

      * already terminal (``done`` / ``error`` / ``cancelled``) → no-op,
        refreshed row returned as-is so the UI sees the real outcome.
      * running / pending with a live task → ``task.cancel()`` and the
        task's ``except CancelledError`` branch writes ``status=cancelled``
        before the task ends.
      * running / pending with **no** task (API restarted while the run
        was in flight, say) → flip the row to ``cancelled`` directly so
        the UI stops polling; there's no task to kill.

    Cooperative note: asyncio cancellation only fires at the next
    ``await`` point. An LLM call already mid-``httpx.post`` will complete
    that request before unwinding. That's a single-operator-tool
    acceptable cost — the alternative (hard-kill the task's underlying
    file descriptors) is a lot of machinery for a trim benefit.
    """
    with Session(db.engine) as session:
        row = session.get(AgentRun, run_id)
        if row is None:
            return None
        status = row.status

    if status in ("done", "error", "cancelled"):
        return _reload_run(run_id)

    task = _run_tasks.get(run_id)
    if task is not None and not task.done():
        task.cancel()
        # The task's own CancelledError branch updates the row.
        # We still return the current (pre-finalisation) view so the
        # HTTP handler can respond immediately; the UI picks up the
        # cancelled state on its next poll.
        return _reload_run(run_id)

    # No task live — either a stale ``pending`` from a pre-restart
    # run, or a race where the task popped just before we looked.
    # Either way, update the row so it isn't stuck in a non-terminal
    # state forever.
    _update_run(
        run_id,
        status="cancelled",
        error="cancelled (no active task)",
        ended_at=_now(),
    )
    return _reload_run(run_id)


# ── Inner loop ───────────────────────────────────────────────────
async def _run_to_completion(
    agent_cls: type[Agent],
    run_id:    str,
    operator:  str,
    prompt:    str,
    context:   dict[str, Any],
) -> AgentRun:
    """Drive an agent to completion, persisting every step and the
    terminal state. Always returns a refreshed row — errors become
    ``status=error`` on the row rather than exceptions out of the
    function, so the sync and async dispatch paths behave identically
    from the caller's perspective.
    """
    agent = agent_cls()
    ctx = AgentContext(
        operator=operator,
        run_id=run_id,
        prompt=prompt,
        extra=context,
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
    except Exception as exc:  # noqa: BLE001 — we capture everything into the row
        _update_run(run_id, status="error", error=str(exc)[:500], ended_at=_now())
        _log.warning("Agent %s run %s failed: %s", agent_cls.__name__, run_id, exc)
        return _reload_run(run_id)

    _update_run(
        run_id,
        status="done",
        result=final_payload,
        ended_at=_now(),
    )
    return _reload_run(run_id)


async def _run_to_completion_safe(
    agent_cls: type[Agent],
    run_id:    str,
    operator:  str,
    prompt:    str,
    context:   dict[str, Any],
) -> None:
    """Fire-and-forget wrapper used by the async dispatch path.

    ``_run_to_completion`` already captures agent-level exceptions
    into the row. This wrapper is a defence-in-depth net for the
    pathological case where the persistence layer itself raises —
    without it, asyncio would log ``Task exception was never
    retrieved`` and the run row would be stuck in ``running`` with
    no explanation.

    CancelledError is BaseException, not Exception — the inner
    ``except Exception`` in ``_run_to_completion`` doesn't swallow it.
    We catch it here so the DB row lands in a terminal ``cancelled``
    state and the UI stops polling; then we re-raise so the task's own
    cancelled-state stays honest for anyone introspecting it.
    """
    try:
        await _run_to_completion(agent_cls, run_id, operator, prompt, context)
    except asyncio.CancelledError:
        try:
            _update_run(
                run_id, status="cancelled",
                error="cancelled by operator",
                ended_at=_now(),
            )
        except Exception:  # noqa: BLE001
            # Best-effort finaliser; if the DB write fails we've at
            # least logged implicitly via the task's cancelled state.
            pass
        raise
    except Exception as exc:  # noqa: BLE001
        _log.exception("Background agent task crashed outside capture: %s", exc)
        # Best-effort: mark the row as errored so the UI doesn't spin
        # forever. If *this* raises too, there's nothing sensible left
        # to do — we've already logged.
        try:
            _update_run(
                run_id, status="error",
                error=f"runtime crash: {exc}"[:500],
                ended_at=_now(),
            )
        except Exception:  # noqa: BLE001
            pass


async def _iter(gen: AsyncIterator[Step]) -> AsyncIterator[Step]:
    """Pass-through async-iterator — exists only as an extension point
    for future instrumentation (timing, rate limits, step caching)."""
    async for step in gen:
        yield step
