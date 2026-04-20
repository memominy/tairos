"""Runtime configuration — loaded from environment variables (or a .env file).

Using pydantic-settings gives us:
  * typed access (``settings.db_url`` is a ``str``, not a dict lookup)
  * validation at import time (a bad ``CORS_ORIGINS`` fails fast instead
    of blowing up on first request)
  * a single source of truth so tests can override via ``monkeypatch``
    without touching ``os.environ``.

Design notes
------------
* The default DB path sits next to the package root under
  ``apps/api/.data/tairos.sqlite`` — .data/ is git-ignored by
  apps/api/.gitignore. In production (docker-compose, Windows
  service, whatever wraps this later) the operator overrides
  ``DATABASE_URL`` explicitly.
* ``SPATIALITE_PATH`` is optional: if set, ``db.py`` tries to load
  the extension on every new connection; if missing or unset the
  backend runs without spatial functions (coverage polygons stay
  client-side via Turf until we actually need server-side GIS).
* CORS defaults to the Vite dev server origin. When the frontend is
  bundled behind the same origin as the API this can be locked down
  by setting ``CORS_ORIGINS=""`` — empty string disables CORS
  entirely (FastAPI just won't install the middleware).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ``apps/api`` — two levels up from ``src/tairos_api/config.py``.
API_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────
    env:   str = "dev"               # "dev" | "test" | "prod"
    debug: bool = True

    # ── Database ─────────────────────────────────────────────
    # SQLModel/SQLAlchemy URL. Default keeps the DB file inside
    # apps/api/.data/ so it travels with the workspace.
    database_url: str = f"sqlite:///{(API_ROOT / '.data' / 'tairos.sqlite').as_posix()}"

    # Optional SpatiaLite extension path. Windows example:
    #   SPATIALITE_PATH=C:/tools/spatialite/mod_spatialite.dll
    spatialite_path: str | None = None

    # ── HTTP ─────────────────────────────────────────────────
    host: str = "127.0.0.1"
    port: int = 8000

    # Comma-separated list in env (``CORS_ORIGINS=http://a,http://b``)
    # or a single string. Empty/None disables the middleware entirely.
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # ── LLM bridge ───────────────────────────────────────────
    # ``LlmAgent`` POSTs to this URL to reach the Claude Max CLI bridge
    # (scripts/assistant-server.mjs). Kept as a setting so deploys that
    # relocate the bridge (different host/port, reverse proxy, future
    # cloud SDK adapter) don't need code changes — just env.
    llm_bridge_url: str = "http://localhost:8787"
    # Optional override of the model the bridge passes to ``claude -p``.
    # Empty string = let Claude Code pick (current Max default).
    llm_model: str = ""
    # Hard cap on the LLM tool-use loop. A misbehaving agent that keeps
    # emitting tool calls without a terminal answer is bounded by this
    # — last iteration collapses into a best-effort final step.
    llm_max_iterations: int = 6
    # Bridge HTTP timeout in seconds. Claude Code's Max subscription can
    # take a while on cold start / long prompts; 120s matches the
    # bridge-side ``CLAUDE_TIMEOUT_MS`` default (90s) with a little slack.
    llm_timeout_seconds: float = 120.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        # pydantic-settings feeds env vars as strings — split on commas
        # here instead of forcing operators to write JSON in their .env.
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env",
        env_file_encoding="utf-8",
        # Ignore unknown keys so ``.env`` can stash future knobs
        # without breaking older checkouts.
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Memoised settings accessor.

    Tests that want to override configuration can call
    ``get_settings.cache_clear()`` after patching the environment,
    or use the ``Settings`` constructor directly for an isolated
    instance.
    """
    return Settings()
