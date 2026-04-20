"""End-to-end tests for the agent framework.

Covers:
  * agents list endpoint exposes the example agent
  * running the example agent produces a full timeline of steps,
    including plan/tool_call/tool_result/final kinds
  * the persisted AgentRun ends with status=done and the final
    summary as its result
  * MCP tools/list + tools/call round-trip a real tool
  * bridge health proxy — happy path and the common failure modes
    (bridge down, timeout, non-JSON body, bridge reports ok=False)
"""
from __future__ import annotations

from typing import Any

import httpx
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
    agents = res.json()["agents"]
    names = [a["name"] for a in agents]
    assert "inventory_analyst" in names

    # Each descriptor must carry ``kind`` — the frontend gates the
    # LLM badge + bridge-health warning on it.
    deterministic = next(a for a in agents if a["name"] == "inventory_analyst")
    assert deterministic["kind"] == "deterministic"
    llm_variant = next(a for a in agents if a["name"] == "llm_inventory_analyst")
    assert llm_variant["kind"] == "llm"


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


# ── Runs list (history) ──────────────────────────────────────
async def test_list_runs_returns_recent_first(client: AsyncClient) -> None:
    """Runs come back newest-first so the UI's history panel doesn't
    have to sort client-side."""
    # Kick off three deterministic runs; each persists a row with
    # monotonically increasing created_at.
    for _ in range(3):
        res = await client.post(
            "/v1/agents/inventory_analyst/runs",
            json={"operator": "TR"},
        )
        assert res.status_code == 200

    res = await client.get("/v1/agents/runs")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert len(body["runs"]) == 3

    # Newest first by created_at.
    stamps = [r["created_at"] for r in body["runs"]]
    assert stamps == sorted(stamps, reverse=True)


async def test_list_runs_filters_by_operator(client: AsyncClient) -> None:
    """Two operators should never see each other's runs unless they
    explicitly ask for the whole list (no operator filter)."""
    for op in ("TR", "US", "US"):
        res = await client.post(
            "/v1/agents/inventory_analyst/runs",
            json={"operator": op},
        )
        assert res.status_code == 200

    tr = (await client.get("/v1/agents/runs", params={"operator": "TR"})).json()
    us = (await client.get("/v1/agents/runs", params={"operator": "US"})).json()
    assert tr["total"] == 1
    assert us["total"] == 2
    assert all(r["operator"] == "TR" for r in tr["runs"])
    assert all(r["operator"] == "US" for r in us["runs"])


async def test_list_runs_filters_by_agent_and_status(client: AsyncClient) -> None:
    """Combining filters narrows: agent + status together."""
    for _ in range(2):
        await client.post("/v1/agents/inventory_analyst/runs", json={"operator": "TR"})
    # One guaranteed failure by POSTing an unknown agent → 404, doesn't
    # create a row. So we stay at 2 done runs for inventory_analyst.

    res = await client.get(
        "/v1/agents/runs",
        params={"agent": "inventory_analyst", "status": "done"},
    )
    body = res.json()
    assert body["total"] == 2
    assert all(r["agent"] == "inventory_analyst" for r in body["runs"])
    assert all(r["status"] == "done"               for r in body["runs"])


async def test_list_runs_pagination(client: AsyncClient) -> None:
    """``limit`` trims the returned list but ``total`` still counts
    everything that matched the filters."""
    for _ in range(5):
        await client.post("/v1/agents/inventory_analyst/runs", json={"operator": "TR"})

    page = (
        await client.get("/v1/agents/runs", params={"limit": 2, "offset": 0})
    ).json()
    assert page["total"] == 5
    assert len(page["runs"]) == 2

    page2 = (
        await client.get("/v1/agents/runs", params={"limit": 2, "offset": 2})
    ).json()
    assert page2["total"] == 5
    assert len(page2["runs"]) == 2
    # No overlap between pages.
    ids_page  = {r["id"] for r in page["runs"]}
    ids_page2 = {r["id"] for r in page2["runs"]}
    assert ids_page.isdisjoint(ids_page2)


async def test_list_runs_empty_db_returns_zero(client: AsyncClient) -> None:
    res = await client.get("/v1/agents/runs")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["runs"] == []


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


# ── Bridge health proxy ──────────────────────────────────────
# We fake ``httpx.AsyncClient.get`` at module scope so tests don't
# depend on the Node bridge actually running. Each test installs
# whichever fake it needs.
def _install_fake_httpx_get(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    async def fake_get(self, url, **_kw):  # noqa: ARG001
        return await handler(url)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)


def _make_response(status: int, body: Any) -> httpx.Response:
    # httpx.Response constructor needs a Request for .url to work;
    # we don't rely on it but pass one to keep httpx happy.
    req = httpx.Request("GET", "http://test/health")
    return httpx.Response(status_code=status, json=body, request=req)


async def test_bridge_health_ok_when_bridge_is_up(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    async def handler(url: str):
        assert url.endswith("/health")
        return _make_response(200, {
            "ok":      True,
            "version": "1.2.3 (Claude Code)",
            "cmd":     "C:\\fake\\claude.exe",
        })

    _install_fake_httpx_get(monkeypatch, handler)

    res = await client.get("/v1/agents/bridge/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"]      is True
    assert body["version"] == "1.2.3 (Claude Code)"
    assert body["cmd"]     == "C:\\fake\\claude.exe"
    assert body["error"]   is None
    assert body["bridge_url"].startswith("http")


async def test_bridge_health_forwards_bridge_side_failure(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """Bridge itself is up but ``claude`` CLI is missing → bridge
    returns ``{ok: false, error: ...}`` with HTTP 503. We forward the
    error verbatim instead of masking it as a generic 'up'."""
    async def handler(_url: str):
        return _make_response(503, {"ok": False, "error": "claude-cli-missing"})

    _install_fake_httpx_get(monkeypatch, handler)

    res = await client.get("/v1/agents/bridge/health")
    assert res.status_code == 200   # the API always returns 200
    body = res.json()
    assert body["ok"]    is False
    assert body["error"] == "claude-cli-missing"


async def test_bridge_health_connect_error(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """Bridge not running at all → ConnectError. The endpoint must
    still respond 200 with ``ok: false`` so the UI can render."""
    async def handler(_url: str):
        raise httpx.ConnectError("Connection refused")

    _install_fake_httpx_get(monkeypatch, handler)

    res = await client.get("/v1/agents/bridge/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"]    is False
    assert "Connection refused" in (body["error"] or "")


async def test_bridge_health_timeout(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """Bridge hangs → TimeoutException. Surface a clean ``timeout``
    string — operators want to know it's slow, not dead."""
    async def handler(_url: str):
        raise httpx.ReadTimeout("boom")

    _install_fake_httpx_get(monkeypatch, handler)

    res = await client.get("/v1/agents/bridge/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"]    is False
    assert body["error"] == "timeout"


async def test_bridge_health_handles_non_json_body(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """A misconfigured reverse proxy returning HTML shouldn't crash
    the endpoint with a JSONDecodeError."""
    req = httpx.Request("GET", "http://test/health")

    async def handler(_url: str):
        return httpx.Response(
            status_code=502,
            content=b"<html>nginx bad gateway</html>",
            request=req,
        )

    _install_fake_httpx_get(monkeypatch, handler)

    res = await client.get("/v1/agents/bridge/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is False
    assert "non-JSON" in (body["error"] or "")
