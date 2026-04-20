# @tairos/api

FastAPI backend for Tairos Sentinel — durable persistence layer for
inventory, conflicts, saved views, and agent state. The web frontend
(`apps/web`) still persists everything to `localStorage` today;
migration to this backend happens one slice at a time (inventory
first, then saved views, then conflicts).

## Stack

- **Python 3.11+**
- **FastAPI** + **uvicorn** (`standard` extras for websockets/httptools)
- **SQLModel** — pydantic v2 + SQLAlchemy in a single declarative layer
- **SQLite** with optional **SpatiaLite** extension
- **Alembic** for migrations (batch-mode for SQLite-safe ALTERs)
- **pytest** + **httpx AsyncClient** for API tests, **ruff** for lint

## Layout

```
apps/api/
├── pyproject.toml          # project + ruff + pytest config
├── alembic.ini             # alembic config (URL overridden by .env)
├── alembic/
│   ├── env.py              # targets SQLModel.metadata
│   └── script.py.mako      # migration template (batch-mode)
├── src/
│   └── tairos_api/
│       ├── __init__.py
│       ├── main.py         # FastAPI app factory + module-level `app`
│       ├── config.py       # pydantic-settings, reads .env
│       ├── db.py           # engine + session dependency + PRAGMAs
│       ├── models/
│       │   ├── __init__.py # registers tables on SQLModel.metadata
│       │   └── node.py     # inventory node (first migration target)
│       └── routers/
│           ├── health.py   # /v1/health + /v1/ready
│           └── nodes.py    # /v1/nodes CRUD (operator-scoped)
└── tests/
    ├── conftest.py         # in-memory DB + ASGI transport
    ├── test_health.py
    └── test_nodes.py
```

## Local dev

Run these from `apps/api/`. A venv is recommended so the backend
dependencies don't leak into your global Python.

```bash
# one-time setup
cd apps/api
python -m venv .venv
.venv\Scripts\activate        # Windows
# .venv/bin/activate          # macOS / Linux
pip install -e .[dev]

# copy env defaults (optional — empty .env is equivalent)
copy .env.example .env

# apply migrations (creates the node table)
alembic upgrade head

# seed inventory from the frontend JSON (one-shot, idempotent)
python -m scripts.seed_nodes_from_frontend

# start the dev server with auto-reload
uvicorn tairos_api.main:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs for the Swagger UI.

From the repo root the same flow is available as npm scripts:

```bash
npm run api:migrate          # alembic upgrade head
npm run api:seed:inventory   # seed from apps/web/src/data/tairos-nodes.json
npm run api:dev              # uvicorn with --reload
npm run api:test             # pytest
```

## Tests

```bash
cd apps/api
pytest
```

Tests run against an in-memory SQLite DB; they never touch
`apps/api/.data/`.

## Migrations

Once a model changes:

```bash
cd apps/api
alembic revision --autogenerate -m "add foo to nodes"
alembic upgrade head
```

Alembic reads `DATABASE_URL` from `.env` via `env.py`, so the same
config that drives the app drives migrations.

## SpatiaLite

Disabled by default. To enable:

1. Install the SpatiaLite binary for your platform.
2. Set `SPATIALITE_PATH` in `.env` to the absolute path of
   `mod_spatialite.dll` (Windows) or `mod_spatialite.so` (Linux/macOS).
3. Restart the server. `db.py` will load the extension on every new
   connection; if loading fails the server keeps running without
   spatial functions.

Spatial endpoints (coverage aggregation, point-in-polygon queries) will
return `501 Not Implemented` until both SpatiaLite is loaded AND those
endpoints are wired up — the frontend still computes coverage client-side
via Turf in the meantime.

## Design rationale

- **Operator-scoped listing is enforced at the API level.** `GET /v1/nodes`
  requires an `operator` query parameter; the frontend can't
  accidentally broadcast-fetch every node in the database.
- **`extra` JSON column absorbs UI churn.** The frontend keeps growing
  node metadata (group memberships, product attachments, area
  polygons). Rather than migrating the schema on every UI tweak, that
  goes into a free-form JSON blob until a field is stable enough to
  promote to its own column.
- **Auto-create at dev-time only.** `ENV=dev` runs `create_all` on
  startup; `ENV=prod` relies exclusively on alembic. This prevents
  the classic "works on my machine but prod migrations are stale"
  failure mode.
