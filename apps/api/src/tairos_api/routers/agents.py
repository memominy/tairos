"""Agents HTTP surface.

  GET  /v1/agents                        — list registered agents
  POST /v1/agents/{name}/runs            — start a run, return AgentRun
  GET  /v1/agents/runs/{run_id}          — fetch run + step timeline

``POST`` runs the agent synchronously and returns the terminal
``AgentRun`` row. For deterministic example agents this is
indistinguishable from a regular CRUD endpoint — sub-millisecond
latency, done inline. When LLM-backed agents land, this endpoint
will flip to an async task + return ``pending`` immediately, and the
GET endpoint becomes the polling target.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..agents.registry import registry
from ..agents.runtime import execute_run
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


# ── List agents ──────────────────────────────────────────────
@router.get("")
def list_agents():
    return {
        "agents": [cls.describe() for cls in registry.list_agents()],
    }


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
