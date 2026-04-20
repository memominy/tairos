"""InventoryAnalyst — the reference agent.

Deterministic, LLM-free: walks the Node table via the ``list_nodes``
and ``count_nodes`` tools and emits a human-readable summary. Useful
as a smoke-test agent during development, and as the shape every
future agent follows — subclass ``Agent``, yield Steps, call Tools
through ``ctx.tool_ctx()``.

Flow:
  1. yield plan  — "I'm going to look up inventory for {operator}"
  2. call count_nodes  → yield tool_call + tool_result
  3. call list_nodes(limit=5)  → yield tool_call + tool_result
  4. yield final  — summary dict the UI can render
"""
from __future__ import annotations

from collections.abc import AsyncIterator

from ..base import Agent, AgentContext, Step
from ..tools.inventory import CountNodesInput, CountNodesTool, ListNodesInput, ListNodesTool


class InventoryAnalyst(Agent):
    name        = "inventory_analyst"
    description = "Özet: operatör için envanter durumu ve son eklenen düğümler."
    tools       = [CountNodesTool(), ListNodesTool()]

    async def arun(self, ctx: AgentContext) -> AsyncIterator[Step]:
        yield Step(kind="plan", payload={
            "summary": f"{ctx.operator} envanterini özetleyeceğim.",
            "steps":   ["count_nodes", "list_nodes", "final"],
        })

        tool_ctx = ctx.tool_ctx()

        # ── count_nodes ────────────────────────────────────
        count_tool   = self.tools[0]
        count_input  = CountNodesInput()
        yield Step(kind="tool_call",   payload={"tool": count_tool.name, "input": count_input.model_dump()})
        count_result = await count_tool.run(count_input, tool_ctx)
        yield Step(kind="tool_result", payload={"tool": count_tool.name, "output": count_result})

        # ── list_nodes ─────────────────────────────────────
        list_tool   = self.tools[1]
        list_input  = ListNodesInput(limit=5)
        yield Step(kind="tool_call",   payload={"tool": list_tool.name, "input": list_input.model_dump()})
        list_result = await list_tool.run(list_input, tool_ctx)
        yield Step(kind="tool_result", payload={"tool": list_tool.name, "output": list_result})

        total = count_result.get("total", 0)
        recent = list_result.get("nodes", [])
        summary = (
            f"{ctx.operator} operatörü için {total} envanter kaydı var. "
            + (
                "Son girişler: " + ", ".join(n["name"] for n in recent)
                if recent else "Kayıt bulunmadı."
            )
        )

        yield Step(kind="final", payload={
            "summary": summary,
            "total":   total,
            "recent":  recent,
        })
