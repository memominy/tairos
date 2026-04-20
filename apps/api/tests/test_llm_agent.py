"""Tests for the LlmAgent framework.

The LLM bridge (``scripts/assistant-server.mjs``) is external — we
don't spawn it in tests. Instead, we monkeypatch
``LlmAgent._call_llm`` to return a scripted sequence of replies and
assert the timeline + persistence behave correctly.

Coverage:
  * Happy path: LLM calls count_nodes, then list_nodes, then final.
  * Unknown tool: timeline carries an error tool_result but keeps
    going.
  * Malformed reply then recovery: protocol nudge gets it back on
    track.
  * Bridge unavailable (``_call_llm`` raises): final step carries
    the error instead of crashing the run.
  * Max-iterations guard rail.
"""
from __future__ import annotations

import json
from collections.abc import Iterable

import pytest
from httpx import AsyncClient

from tairos_api.agents.examples.llm_inventory_analyst import LlmInventoryAnalyst
from tairos_api.agents.registry import seed


@pytest.fixture(autouse=True)
def _seed_registry():
    seed()


def _script(replies: Iterable[str]):
    """Build an async ``_call_llm`` replacement that replays ``replies``
    in order; each call pops the next line."""
    it = iter(list(replies))

    async def fake_call_llm(self, http, bridge, system, messages, model):  # noqa: ARG001
        try:
            return next(it)
        except StopIteration as exc:
            raise AssertionError("LLM was called more times than scripted") from exc

    return fake_call_llm


async def _create_tr_node(client: AsyncClient, *, name: str) -> None:
    res = await client.post("/v1/nodes", json={
        "operator": "TR", "name": name, "lat": 39.0, "lng": 35.0,
    })
    assert res.status_code == 201, res.text


async def test_llm_inventory_analyst_happy_path(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """Full loop: count → list → final. All three steps land on the
    timeline and the final summary is what the LLM emitted."""
    await _create_tr_node(client, name="Alpha")
    await _create_tr_node(client, name="Bravo")

    monkeypatch.setattr(
        LlmInventoryAnalyst, "_call_llm",
        _script([
            '<tool_call>{"name":"count_nodes","input":{}}</tool_call>',
            '<tool_call>{"name":"list_nodes","input":{"limit":5}}</tool_call>',
            '<final>{"summary":"TR operatöründe 2 kayıt bulunuyor.",'
            ' "total":2, "recent":["Alpha","Bravo"]}</final>',
        ]),
    )

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR", "prompt": "Durumu özetle"},
    )
    assert res.status_code == 200, res.text
    run = res.json()
    assert run["status"]   == "done"
    assert run["agent"]    == "llm_inventory_analyst"
    assert run["operator"] == "TR"

    # Timeline: plan, tool_call×2, tool_result×2, final
    tl = await client.get(f"/v1/agents/runs/{run['id']}")
    assert tl.status_code == 200
    steps = tl.json()["steps"]
    kinds = [s["kind"] for s in steps]
    assert kinds[0]   == "plan"
    assert kinds[-1]  == "final"
    assert kinds.count("tool_call")   == 2
    assert kinds.count("tool_result") == 2

    tool_names_called = [
        s["payload"]["tool"] for s in steps if s["kind"] == "tool_call"
    ]
    assert tool_names_called == ["count_nodes", "list_nodes"]

    final = run["result"]
    assert "TR" in final["summary"]
    # LlmAgent flattens the LLM payload at the top level so the UI's
    # ResultBlock treats LLM and deterministic agents the same.
    assert final["total"]  == 2
    assert final["recent"] == ["Alpha", "Bravo"]
    assert final["turns"]  == 3  # count + list + final


async def test_llm_agent_unknown_tool_surfaces_error_and_recovers(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """If the LLM calls a tool that doesn't exist, the step records an
    error but the loop keeps going so the LLM can recover."""
    monkeypatch.setattr(
        LlmInventoryAnalyst, "_call_llm",
        _script([
            '<tool_call>{"name":"ghost_tool","input":{}}</tool_call>',
            '<final>{"summary":"Araç yoktu, sayım yapılamadı.", "total":0}</final>',
        ]),
    )

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["status"] == "done"

    tl = (await client.get(f"/v1/agents/runs/{run['id']}")).json()
    error_step = next(
        s for s in tl["steps"]
        if s["kind"] == "tool_result" and s["payload"].get("tool") == "ghost_tool"
    )
    assert "Bilinmeyen araç" in error_step["payload"]["error"]
    assert run["result"]["total"] == 0


async def test_llm_agent_tolerates_malformed_reply(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """A reply that isn't valid protocol → one nudge, then a valid
    final lands cleanly."""
    monkeypatch.setattr(
        LlmInventoryAnalyst, "_call_llm",
        _script([
            "bunu nasıl yaparım ki?",           # no tags → malformed
            '<final>{"summary":"TR temiz.", "total":0}</final>',
        ]),
    )

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["status"] == "done"
    assert run["result"]["summary"] == "TR temiz."


async def test_llm_agent_bridge_unavailable_yields_final_error(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """``_call_llm`` blowing up must become a structured final, not a
    500 from the HTTP handler — the UI has to see *why* it failed."""

    async def boom(self, *a, **kw):  # noqa: ARG001
        raise RuntimeError("bridge offline")

    monkeypatch.setattr(LlmInventoryAnalyst, "_call_llm", boom)

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["status"] == "done"
    assert "bridge offline" in run["result"]["summary"]
    assert run["result"]["error"] == "bridge offline"


async def test_llm_agent_respects_max_iterations(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """An LLM that keeps calling tools without converging is capped
    by ``max_iterations`` and gets a synthetic final step."""
    # LlmInventoryAnalyst.max_iterations = 4 — feed five call turns.
    monkeypatch.setattr(
        LlmInventoryAnalyst, "_call_llm",
        _script([
            '<tool_call>{"name":"count_nodes","input":{}}</tool_call>',
            '<tool_call>{"name":"count_nodes","input":{}}</tool_call>',
            '<tool_call>{"name":"count_nodes","input":{}}</tool_call>',
            '<tool_call>{"name":"count_nodes","input":{}}</tool_call>',
        ]),
    )

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["status"] == "done"
    assert run["result"]["error"] == "max_iterations_exceeded"
    assert run["result"]["turns"] == 4


async def test_llm_inventory_analyst_visible_in_agents_list(
    client: AsyncClient,
) -> None:
    res = await client.get("/v1/agents")
    names = [a["name"] for a in res.json()["agents"]]
    assert "llm_inventory_analyst" in names


def test_parse_llm_reply_accepts_fenced_code_block() -> None:
    """Robustness: LLMs sometimes wrap JSON in ```json fences. The
    parser should salvage them when they look like a final payload."""
    from tairos_api.agents.llm import _parse_llm_reply

    raw = (
        "Tabii, işte cevabım:\n"
        "```json\n"
        '{"summary":"Test", "total":0}\n'
        "```\n"
    )
    kind, payload, _ = _parse_llm_reply(raw)
    assert kind == "final"
    assert payload == {"summary": "Test", "total": 0}


def test_parse_llm_reply_prefers_tool_call_over_final() -> None:
    """If both tags somehow appear, tool_call wins — it's the safer
    default (reversible: we can still emit a final next turn).
    """
    from tairos_api.agents.llm import _parse_llm_reply

    raw = (
        '<tool_call>{"name":"count_nodes","input":{}}</tool_call>'
        '<final>{"summary":"already done"}</final>'
    )
    kind, payload, _ = _parse_llm_reply(raw)
    assert kind == "tool_call"
    assert payload["name"] == "count_nodes"


def test_parse_llm_reply_malformed_json_in_tags_returns_malformed() -> None:
    from tairos_api.agents.llm import _parse_llm_reply

    raw = '<tool_call>{not valid json}</tool_call>'
    kind, payload, _ = _parse_llm_reply(raw)
    assert kind    == "malformed"
    assert payload is None


def test_format_tools_block_renders_every_tool() -> None:
    from tairos_api.agents.llm import _format_tools_block
    from tairos_api.agents.tools.inventory import CountNodesTool, ListNodesTool

    block = _format_tools_block([ListNodesTool(), CountNodesTool()])
    assert "list_nodes"  in block
    assert "count_nodes" in block
    # JSON-schema blob embedded → indirect check that .describe()
    # was called without blowing up.
    assert "inputSchema" in block


def test_format_tools_block_handles_empty_toolset() -> None:
    from tairos_api.agents.llm import _format_tools_block

    assert "Kullanılabilir araç yok" in _format_tools_block([])


def test_llm_inventory_analyst_describe_shape() -> None:
    """Registered agent must advertise tools in the UI descriptor —
    otherwise the AgentsPanel can't render the tool list."""
    desc = LlmInventoryAnalyst.describe()
    assert desc["name"] == "llm_inventory_analyst"
    tool_names = {t["name"] for t in desc["tools"]}
    assert tool_names == {"count_nodes", "list_nodes"}


async def test_llm_agent_tool_input_validation_error_recovers(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """LLM hands in bogus input shape → we record the pydantic error
    on the tool_result step; the loop continues and the next turn
    can still emit a valid final."""
    monkeypatch.setattr(
        LlmInventoryAnalyst, "_call_llm",
        _script([
            # limit must be 1..500 — negative fails validation
            '<tool_call>{"name":"list_nodes","input":{"limit":-3}}</tool_call>',
            '<final>{"summary":"Giriş hatalıydı, 0 kabul edildi.", "total":0}</final>',
        ]),
    )

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    run = res.json()
    assert run["status"] == "done"

    tl = (await client.get(f"/v1/agents/runs/{run['id']}")).json()
    error_step = next(
        s for s in tl["steps"]
        if s["kind"] == "tool_result" and s["payload"].get("tool") == "list_nodes"
    )
    assert "error" in error_step["payload"]
    # Sanity: error message from pydantic is plain JSON-safe string
    assert isinstance(error_step["payload"]["error"], str)
    _ = json.dumps(error_step["payload"])  # must be serialisable
