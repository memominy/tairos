"""Tool abstraction — the unit of external effect an agent can wield.

A Tool has:
  * a stable ``name`` (used as the MCP method name)
  * a human-readable ``description`` (shown in UI, fed to LLMs)
  * a pydantic ``input_schema`` class
  * a pydantic ``output_schema`` class (optional; defaults to ``dict``)
  * an async ``run(input, ctx)`` coroutine returning the output

Why pydantic schemas?
~~~~~~~~~~~~~~~~~~~~~
MCP-style tool descriptions are just JSON Schema. Pydantic v2 emits
a canonical JSON Schema via ``.model_json_schema()``, so registering
a tool automatically gives us:

  * validation on incoming invocations (bad input → 400 before the
    tool body runs),
  * a machine-readable description for UI rendering,
  * a stable contract for LLM function-calling when that arrives.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

TIn  = TypeVar("TIn",  bound=BaseModel)
TOut = TypeVar("TOut", bound=BaseModel)


@dataclass(slots=True)
class ToolContext:
    """Runtime context handed to every tool invocation.

    * ``operator`` — the operator scope the enclosing agent run was
      bound to. Tools that touch operator-scoped tables MUST filter
      by this; the framework won't do it implicitly.
    * ``run_id`` — parent ``AgentRun.id``, useful for audit logs or
      cross-step coordination.
    * ``extra`` — free-form bag for agent-specific metadata (e.g.
      focus country, active filters). Tools treat this as advisory.
    """

    operator: str
    run_id:   str
    extra:    dict[str, Any] = field(default_factory=dict)


class Tool(abc.ABC, Generic[TIn, TOut]):
    """Abstract Tool. Subclasses set the class attributes."""

    name:           str
    description:    str
    input_schema:   type[BaseModel]
    output_schema:  type[BaseModel] | None = None

    @abc.abstractmethod
    async def run(self, payload: TIn, ctx: ToolContext) -> TOut | dict[str, Any]:
        """Perform the tool's side-effect / query and return its output."""

    # ── Introspection ────────────────────────────────────────
    @classmethod
    def describe(cls) -> dict[str, Any]:
        """MCP-style descriptor. Shape matches the ``tools/list``
        response in the Model Context Protocol — future MCP server
        layer can serialise this as-is.
        """
        return {
            "name":        cls.name,
            "description": cls.description,
            "inputSchema": cls.input_schema.model_json_schema(),
            "outputSchema": (
                cls.output_schema.model_json_schema()
                if cls.output_schema else None
            ),
        }
