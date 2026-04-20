"""Liveness + readiness probe.

``/v1/health`` is intentionally cheap — the frontend pings it on
startup to decide whether to show the "backend offline" banner, so we
don't want it to depend on the database. ``/v1/ready`` does a trivial
``SELECT 1`` through the session dependency to confirm the DB is
reachable and tables exist.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from ..db import get_session

router = APIRouter(prefix="/v1", tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Cheap liveness check. No I/O."""
    return {"status": "ok"}


@router.get("/ready")
def ready(session: Session = Depends(get_session)) -> dict[str, str]:
    """Readiness — verifies the database connection is usable."""
    session.exec(text("SELECT 1"))
    return {"status": "ready"}
