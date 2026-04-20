"""Agent base class.

An ``Agent`` subclass overrides ``arun`` — an async generator that
yields ``Step`` records. The runtime (``runtime.py``) consumes that
stream, persists each step to the DB, and finalises the ``AgentRun``
row when the generator closes.

Two subclass patterns
~~~~~~~~~~~~~~~~~~~~~
1. **Deterministic** agents (no LLM) — just code. The example
   ``InventoryAnalyst`` walks the Node table and emits a summary.
   These are useful for telemetry dashboards, scheduled jobs, and
   proving the plumbing works before an LLM is plumbed in.
2. **LLM-driven** agents — will inherit from a future ``LlmAgent``
   base that holds the prompt-stitching + tool-loop boilerplate.
   Not implemented yet; the slot exists so the day-one design
   doesn't need to grow.
"""
from __future__ import annotations

import abc
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from .tool import Tool, ToolContext


StepKind = str  # "plan" | "tool_call" | "tool_result" | "final"


@dataclass(slots=True)
class Step:
    kind:    StepKind
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AgentContext:
    """Immutable handle an agent gets for each run."""

    operator: str
    run_id:   str
    prompt:   str
    extra:    dict[str, Any] = field(default_factory=dict)

    def tool_ctx(self) -> ToolContext:
        return ToolContext(
            operator=self.operator,
            run_id=self.run_id,
            extra=self.extra,
        )


class Agent(abc.ABC):
    """Abstract agent.

    Subclasses set:
      * ``name``         — stable identifier, shown in /v1/agents
      * ``description``  — human-readable summary
      * ``tools``        — list of Tool *instances* the agent may call
    """

    name:        str
    description: str
    tools:       list[Tool] = []

    @abc.abstractmethod
    async def arun(self, ctx: AgentContext) -> AsyncIterator[Step]:
        """Yield steps in order. Must yield at least one terminal
        step with ``kind="final"`` — the runtime treats the generator
        closing without a final step as an implicit error.
        """
        if False:  # pragma: no cover — makes the abstract method an async generator
            yield

    # ── Introspection ────────────────────────────────────────
    @classmethod
    def describe(cls) -> dict[str, Any]:
        return {
            "name":        cls.name,
            "description": cls.description,
            "tools":       [t.__class__.describe() for t in cls.tools],
        }
