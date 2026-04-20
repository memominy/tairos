"""In-process registries for Agents and Tools.

Keeping registration explicit (rather than via import-time side
effects) has two payoffs:
  * tests can build an empty registry and register only what they
    need, avoiding cross-test pollution,
  * the list of agents in the UI is the list someone intentionally
    opted into, not whatever modules happen to be importable.

``default_registry()`` is called from ``main.py`` at startup and
populates the global registry with the agents + tools shipped in
this repo. Third-party code can extend it by importing the singleton
and calling ``register_agent`` / ``register_tool`` on it.
"""
from __future__ import annotations

from .base import Agent
from .tool import Tool


class Registry:
    def __init__(self) -> None:
        self._agents: dict[str, type[Agent]] = {}
        self._tools:  dict[str, Tool]        = {}

    # ── Agents ───────────────────────────────────────────────
    def register_agent(self, agent_cls: type[Agent]) -> type[Agent]:
        name = getattr(agent_cls, "name", None)
        if not name:
            raise ValueError(f"Agent {agent_cls!r} is missing .name")
        if name in self._agents:
            raise ValueError(f"Agent {name!r} already registered")
        self._agents[name] = agent_cls
        return agent_cls

    def get_agent(self, name: str) -> type[Agent] | None:
        return self._agents.get(name)

    def list_agents(self) -> list[type[Agent]]:
        return list(self._agents.values())

    # ── Tools ────────────────────────────────────────────────
    def register_tool(self, tool: Tool) -> Tool:
        name = getattr(tool, "name", None)
        if not name:
            raise ValueError(f"Tool {tool!r} is missing .name")
        if name in self._tools:
            raise ValueError(f"Tool {name!r} already registered")
        self._tools[name] = tool
        return tool

    def get_tool(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[Tool]:
        return list(self._tools.values())


# Module-level singleton — populated by ``seed()`` below.
registry = Registry()


def seed(reg: Registry | None = None) -> Registry:
    """Register the built-in agents + tools on the given registry."""
    reg = reg or registry

    # Local imports avoid a circular dependency: tools/agents import
    # the registry module, but only by name.
    from .examples.inventory_analyst     import InventoryAnalyst
    from .examples.llm_inventory_analyst import LlmInventoryAnalyst
    from .examples.news_scanner          import NewsScanner
    from .examples.web_analyst           import WebAnalyst
    from .tools.inventory                import CountNodesTool, ListNodesTool
    from .tools.rss                      import RssFetchTool
    from .tools.web                      import WebFetchTool

    # Re-seeding a populated registry is a no-op; makes fixture setup
    # in tests easier.
    if "list_nodes" not in reg._tools:
        reg.register_tool(ListNodesTool())
    if "count_nodes" not in reg._tools:
        reg.register_tool(CountNodesTool())
    if "web_fetch" not in reg._tools:
        reg.register_tool(WebFetchTool())
    if "rss_fetch" not in reg._tools:
        reg.register_tool(RssFetchTool())
    if reg.get_agent(InventoryAnalyst.name) is None:
        reg.register_agent(InventoryAnalyst)
    if reg.get_agent(LlmInventoryAnalyst.name) is None:
        reg.register_agent(LlmInventoryAnalyst)
    if reg.get_agent(WebAnalyst.name) is None:
        reg.register_agent(WebAnalyst)
    if reg.get_agent(NewsScanner.name) is None:
        reg.register_agent(NewsScanner)

    return reg
