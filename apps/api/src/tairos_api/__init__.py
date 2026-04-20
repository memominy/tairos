"""Tairos Sentinel backend package.

The public surface is defined by ``tairos_api.main:app`` — a FastAPI
application that wires routers, CORS, and the SQLModel session factory.
Everything else (models, routers, config) lives in submodules and is
composed at app-startup time.
"""

__version__ = "0.1.0"
