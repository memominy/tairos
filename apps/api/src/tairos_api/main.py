"""FastAPI application factory + module-level ``app``.

``uvicorn tairos_api.main:app`` works because we export a ready-to-serve
instance here. We still expose ``create_app`` separately so tests can
build fresh apps (e.g. with an overridden session dependency) without
reimporting the module.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, get_settings
from .db import create_db_and_tables
from .routers import health, nodes


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    """App startup/shutdown hooks.

    In dev we auto-create tables so ``uvicorn --reload`` just works
    against a fresh repo. In production alembic migrations are the
    source of truth — ``settings.env == "prod"`` skips the implicit
    ``create_all`` so we don't accidentally diverge from the migration
    history.
    """
    settings = get_settings()
    if settings.env != "prod":
        create_db_and_tables()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title="Tairos Sentinel API",
        version=__version__,
        description="Backend for the Tairos Sentinel command console.",
        debug=settings.debug,
        lifespan=_lifespan,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            # Wide-open locally — locked-down deployments tighten this
            # via env vars. Credentials stay off until we add auth.
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(nodes.router)

    return app


# Exported instance for ``uvicorn tairos_api.main:app``.
app = create_app()
