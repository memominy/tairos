"""End-to-end tests for the agent framework.

Covers:
  * agents list endpoint exposes the example agent
  * running the example agent produces a full timeline of steps,
    including plan/tool_call/tool_result/final kinds
  * the persisted AgentRun ends with status=done and the final
    summary as its result
  * MCP tools/list + tools/call round-trip a real tool
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tairos_api.agents.registry import seed


@pytest.fixture(autouse=True)
def _seed_registry():
    """Make sure the example agent + tools are registered for every
    test. Idempotent so re-seeding is harmless."""
    seed()


async def _create_tr_node(client: AsyncClient, *, name: str) -> None:
    res = await client.post("/v1/nodes", json={
        "operator": "TR", "name": name, "lat": 39.0, "lng": 35.0,
    })
    assert res.status_code == 201, res.text


async def test_list_agents_includes_inventory_analyst(client: AsyncClient) -> None:
    res = await client.get("/v1/agents")
    assert res.status_code == 200
    names = [a["name"] for a in res.json()["agents"]]
    assert "inventory_analyst" in names


async def test_run_inventory_analyst_on_empty_db(client: AsyncClient) -> None:
    res = await client.post(
        "/v1/agents/inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200, res.text
    run = res.json()
    assert run["status"] == "done"
    assert run["agent"]  == "inventory_analyst"
    assert run["operator"] == "TR"
    assert run["result"]["total"] == 0

    # Fetch the timeline and ensure it carries the expected step shape.
    tl = await client.get(f"/v1/agents/runs/{run['id']}")
    assert tl.status_code == 200
    body = tl.json()
    kinds = [s["kind"] for s in body["steps"]]
    assert kinds[0]  == "plan"
    assert kinds[-1] == "final"
    assert "tool_call"   in kinds
    assert "tool_result" in kinds


async def test_run_inventory_analyst_with_nodes(client: AsyncClient) -> None:
    for name in ("Alpha", "Bravo", "Charlie"):
        await _create_tr_node(client, name=name)

    res = await client.post(
        "/v1/agents/inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["result"]["total"] == 3
    assert {n["name"] for n in run["result"]["recent"]} == {"Alpha", "Bravo", "Charlie"}


async def test_run_unknown_agent_returns_404(client: AsyncClient) -> None:
    res = await client.post(
        "/v1/agents/does_not_exist/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 404


# ── MCP ──────────────────────────────────────────────────────
async def test_mcp_tools_list(client: AsyncClient) -> None:
    res = await client.post("/v1/mcp", json={
        "jsonrpc": "2.0", "id": 1, "method": "tools/list",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == 1
    assert body["error"] is None
    names = [t["name"] for t in body["result"]["tools"]]
    assert "list_nodes"  in names
    assert "count_nodes" in names


async def test_mcp_tool_call_count_nodes(client: AsyncClient) -> None:
    await _create_tr_node(client, name="Delta")

    res = await client.post("/v1/mcp", json={
        "jsonrpc": "2.0", "id": "abc", "method": "tools/call",
        "params": {
            "name": "count_nodes",
            "arguments": {},
            "context": {"operator": "TR"},
        },
    })
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "abc"
    assert body["result"]["total"] == 1


async def test_mcp_unknown_tool_returns_error(client: AsyncClient) -> None:
    res = await client.post("/v1/mcp", json={
        "jsonrpc": "2.0", "id": 9, "method": "tools/call",
        "params": {"name": "ghost", "arguments": {}},
    })
    body = res.json()
    assert body["error"]["code"] == 1001  # ERR_TOOL_MISSING
