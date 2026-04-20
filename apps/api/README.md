# @tairos/api

FastAPI backend for Tairos Sentinel — durable persistence layer for
inventory, conflicts, saved views, and agent state. Currently a
placeholder: the web frontend (`apps/web`) still persists everything
to `localStorage` via the debounced store layer.

## Scope (planned)

1. **Inventory** — operator-scoped node catalog (migrated off `localStorage`).
2. **Conflicts + assets** — the read-mostly global dataset; seeded
   from `scripts/seed-*.mjs`, served via `/v1/conflicts` etc.
3. **Saved views** — operator-scoped view presets.
4. **Agents** — MCP-protocol bridge for the Sentinel AI panel; agent
   runs, tool traces, streaming output.

## Stack

- **Python 3.11+**
- **FastAPI** + **uvicorn**
- **SQLite** with **SpatiaLite** (`.so` on Linux / `mod_spatialite.dll`
  on Windows) for geospatial queries — city-level coverage is already
  fast enough that we don't need PostGIS.
- **SQLModel** for ORM (thin pydantic + SQLAlchemy stack).
- **Alembic** for migrations.

No cloud services. No external APIs. The backend runs on the same
machine as the frontend until the project moves past the prototype
phase.

## Local dev (once scaffolded)

```bash
cd apps/api
python -m venv .venv
.venv\\Scripts\\activate        # Windows
pip install -e .[dev]
uvicorn tairos_api.main:app --reload --port 8000
```

Frontend reads `VITE_API_URL` (default `http://localhost:8000`) and
talks to this backend via TanStack Query.
