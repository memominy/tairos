"""Agent tables — agent_run + agent_step.

Revision ID: 0002_agent_tables
Revises:    0001_initial_schema
Create Date: 2026-04-20
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision:      str                         = "0002_agent_tables"
down_revision: str | Sequence[str] | None  = "0001_initial_schema"
branch_labels: str | Sequence[str] | None  = None
depends_on:    str | Sequence[str] | None  = None


def upgrade() -> None:
    op.create_table(
        "agent_run",
        sa.Column("id",         sa.String(length=64), primary_key=True),
        sa.Column("agent",      sa.String(length=64), nullable=False),
        sa.Column("operator",   sa.String(length=4),  nullable=False),
        sa.Column("prompt",     sa.String(),          nullable=False, server_default=""),
        sa.Column("context",    sa.JSON(),            nullable=False),
        sa.Column("status",     sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("result",     sa.JSON(),            nullable=True),
        sa.Column("error",      sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(),        nullable=False),
        sa.Column("started_at", sa.DateTime(),        nullable=True),
        sa.Column("ended_at",   sa.DateTime(),        nullable=True),
    )
    op.create_index("ix_agent_run_agent",    "agent_run", ["agent"])
    op.create_index("ix_agent_run_operator", "agent_run", ["operator"])
    op.create_index("ix_agent_run_status",   "agent_run", ["status"])

    op.create_table(
        "agent_step",
        sa.Column("id",         sa.Integer(),          primary_key=True, autoincrement=True),
        sa.Column("run_id",     sa.String(length=64),  nullable=False),
        sa.Column("index",      sa.Integer(),          nullable=False),
        sa.Column("kind",       sa.String(length=16),  nullable=False),
        sa.Column("payload",    sa.JSON(),             nullable=False),
        sa.Column("created_at", sa.DateTime(),         nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_run.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_step_run_id", "agent_step", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_step_run_id", table_name="agent_step")
    op.drop_table("agent_step")
    op.drop_index("ix_agent_run_status",   table_name="agent_run")
    op.drop_index("ix_agent_run_operator", table_name="agent_run")
    op.drop_index("ix_agent_run_agent",    table_name="agent_run")
    op.drop_table("agent_run")
