"""Agents HTTP surface.

  GET  /v1/agents                        — list registered agents
  GET  /v1/agents/bridge/health          — probe the Claude Max bridge
  POST /v1/agents/{name}/runs            — start a run, return AgentRun
  GET  /v1/agents/runs                   — list recent runs (history)
  GET  /v1/agents/runs/{run_id}          — fetch run + step timeline
  POST /v1/agents/runs/{run_id}/cancel   — best-effort cancel of an
                                           in-flight (or stuck) run

``POST`` dispatches on the registered agent's ``kind``: deterministic
agents run inline (sub-millisecond); LLM (and any future long-running
kind) return a ``pending`` row immediately and the client polls the
``GET`` endpoint for the timeline until status hits
``done``/``error``/``cancelled``. Cancellation is cooperative: the
background task's next await raises ``CancelledError`` and the row flips
to ``status=cancelled``. See ``agents/runtime.py`` for the mechanics.
"""
from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, col, func, select

from ..agents.registry import registry
from ..agents.runtime import cancel_run, execute_run
from ..config import get_settings
from ..db import get_session
from ..models import AgentRun, AgentStep

router = APIRouter(prefix="/v1/agents", tags=["agents"])


class RunRequest(BaseModel):
    operator: str = Field(..., min_length=2, max_length=4)
    prompt:   str = ""
    context:  dict[str, Any] = Field(default_factory=dict)


class RunWithSteps(BaseModel):
    run:   AgentRun
    steps: list[AgentStep]


class RunsListResponse(BaseModel):
    """``GET /v1/agents/runs`` response.

    ``total`` is the unfiltered-by-pagination count so the UI can
    render "23 of 142" or hide pagination when it's unnecessary.
    The ``runs`` list is already trimmed to ``limit``.
    """

    runs:  list[AgentRun]
    total: int


# ── List agents ──────────────────────────────────────────────
@router.get("")
def list_agents():
    return {
        "agents": [cls.describe() for cls in registry.list_agents()],
    }


# ── Bridge health ────────────────────────────────────────────
class BridgeHealth(BaseModel):
    """Shape returned from ``GET /v1/agents/bridge/health``.

    ``ok`` is the only field the frontend must check; everything else
    is diagnostic. ``bridge_url`` is echoed so operators can confirm
    the API is hitting the URL they expect (useful when env vars
    drift across environments).
    """

    ok:         bool
    bridge_url: str
    version:    str | None = None
    cmd:        str | None = None
    error:      str | None = None


@router.get("/bridge/health", response_model=BridgeHealth)
async def bridge_health() -> BridgeHealth:
    """Probe ``scripts/assistant-server.mjs`` at its ``/health``
    endpoint so the UI can tell the operator whether LLM-backed
    agents will work before they hit *Başlat*.

    We keep the timeout short (3s) because the ping should be cheap;
    a longer wait just means a colder UX while the panel hangs on a
    dead bridge.
    """
    settings = get_settings()
    url = settings.llm_bridge_url.rstrip("/") + "/health"
    try:
        async with httpx.AsyncClient(timeout=3.0) as http:
            res = await http.get(url)
    except httpx.TimeoutException:
        return BridgeHealth(ok=False, bridge_url=settings.llm_bridge_url, error="timeout")
    except httpx.HTTPError as exc:
        # ConnectError, ReadError, anything in the httpx family.
        # str(exc) can be empty on some variants, fall back to the
        # class name so the UI has something to show.
        msg = str(exc) or type(exc).__name__
        return BridgeHealth(ok=False, bridge_url=settings.llm_bridge_url, error=msg)

    try:
        data = res.json()
    except ValueError:
        return BridgeHealth(
            ok=False, bridge_url=settings.llm_bridge_url,
            error=f"bridge returned non-JSON (HTTP {res.status_code})",
        )

    # The bridge reports ok=False itself when the claude CLI is
    # missing — forward that verbatim instead of faking an OK.
    return BridgeHealth(
        ok         = bool(data.get("ok")),
        bridge_url = settings.llm_bridge_url,
        version    = data.get("version"),
        cmd        = data.get("cmd"),
        error      = data.get("error"),
    )


# ── Start a run ──────────────────────────────────────────────
@router.post("/{name}/runs", response_model=AgentRun)
async def start_run(name: str, body: RunRequest) -> AgentRun:
    try:
        return await execute_run(
            agent_name=name,
            operator=body.operator,
            prompt=body.prompt,
            context=body.context,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── List runs (history) ──────────────────────────────────────
@router.get("/runs", response_model=RunsListResponse)
def list_runs(
    operator: str | None = Query(default=None, min_length=2, max_length=4),
    agent:    str | None = Query(default=None, max_length=64),
    status:   Literal["pending", "running", "done", "error", "cancelled"] | None = None,
    limit:    int = Query(default=25, ge=1, le=200),
    offset:   int = Query(default=0, ge=0),
    session:  Session = Depends(get_session),
) -> RunsListResponse:
    """Recent runs, newest first.

    Filters combine with AND. Returning ``total`` separately lets the
    UI show "25 / 142" without re-running the query for each page.
    Ordering is stable on ``(created_at desc, id desc)`` — the ``id``
    tiebreaker matters on SQLite where two rows can share a microsecond
    timestamp during a burst.
    """
    stmt = select(AgentRun)
    count_stmt = select(func.count()).select_from(AgentRun)
    if operator is not None:
        stmt = stmt.where(AgentRun.operator == operator)
        count_stmt = count_stmt.where(AgentRun.operator == operator)
    if agent is not None:
        stmt = stmt.where(AgentRun.agent == agent)
        count_stmt = count_stmt.where(AgentRun.agent == agent)
    if status is not None:
        stmt = stmt.where(AgentRun.status == status)
        count_stmt = count_stmt.where(AgentRun.status == status)

    stmt = stmt.order_by(col(AgentRun.created_at).desc(), col(AgentRun.id).desc())
    stmt = stmt.offset(offset).limit(limit)

    runs  = session.exec(stmt).all()
    total = session.exec(count_stmt).one()
    return RunsListResponse(runs=list(runs), total=int(total))


# ── Fetch a run ──────────────────────────────────────────────
@router.get("/runs/{run_id}", response_model=RunWithSteps)
def get_run(run_id: str, session: Session = Depends(get_session)) -> RunWithSteps:
    run = session.get(AgentRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    steps = session.exec(
        select(AgentStep).where(AgentStep.run_id == run_id).order_by(AgentStep.index)
    ).all()
    return RunWithSteps(run=run, steps=steps)


# ── Cancel a run ─────────────────────────────────────────────
@router.post("/runs/{run_id}/cancel", response_model=AgentRun)
def cancel_run_endpoint(run_id: str) -> AgentRun:
    """Best-effort cancellation of an in-flight (or stuck) run.

    Terminal runs (done / error / cancelled) are returned as-is so
    the client can treat the endpoint as idempotent. If cancellation
    is meaningful, the matching background task gets ``.cancel()``d
    and the DB row flips to ``status=cancelled``. Cooperative: an LLM
    call mid-``httpx.post`` completes its single network round-trip
    before the task unwinds.
    """
    row = cancel_run(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return row
