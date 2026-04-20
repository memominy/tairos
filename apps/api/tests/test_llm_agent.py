"""Tests for the LlmAgent framework.

The LLM bridge (``scripts/assistant-server.mjs``) is external — we
don't spawn it in tests. Instead, we monkeypatch
``LlmAgent._call_llm`` to return a scripted sequence of replies and
assert the timeline + persistence behave correctly.

Async dispatch
~~~~~~~~~~~~~~
LLM agents now return a ``pending`` row from ``POST /runs`` and a
background task drives them to completion. Tests use the
``_wait_for_terminal`` helper to poll ``GET /runs/{id}`` until the
status reaches ``done``/``error``. Each scripted ``_call_llm`` reply
returns instantly, so the whole loop finishes in a few event-loop
ticks — the helper's timeout only exists as a sanity guard against
an accidentally hanging test.

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

import asyncio
import json
import time
from collections.abc import Iterable
from typing import Any

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


async def _wait_for_terminal(
    client: AsyncClient, run_id: str, *, timeout: float = 5.0,
) -> dict[str, Any]:
    """Poll ``GET /v1/agents/runs/{run_id}`` until the run hits a
    terminal status (``done`` / ``error``) or the deadline passes.

    Returns the decoded ``{run, steps}`` body. Tests that want to
    assert on steps should use this helper rather than trusting the
    POST response — the async dispatch path returns a pending row
    with no steps yet.
    """
    deadline = time.monotonic() + timeout
    last_body: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        res = await client.get(f"/v1/agents/runs/{run_id}")
        assert res.status_code == 200, res.text
        body = res.json()
        last_body = body
        status = body["run"]["status"]
        if status in ("done", "error"):
            return body
        # Short yield: lets the background task make progress on the
        # same event loop. 10ms is a round number that's plenty
        # fine-grained for scripted-LLM tests.
        await asyncio.sleep(0.01)

    raise AssertionError(
        f"Run {run_id!r} did not reach a terminal status within {timeout}s. "
        f"Last state: {last_body!r}"
    )


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
    initial = res.json()
    # Async dispatch: POST returns a pending row; the background task
    # is already scheduled and will move it through running → done.
    assert initial["status"] in ("pending", "running", "done")
    assert initial["agent"]    == "llm_inventory_analyst"
    assert initial["operator"] == "TR"

    body = await _wait_for_terminal(client, initial["id"])
    run   = body["run"]
    steps = body["steps"]
    assert run["status"] == "done"

    # Timeline: plan, tool_call×2, tool_result×2, final
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
    initial = res.json()

    body = await _wait_for_terminal(client, initial["id"])
    run   = body["run"]
    steps = body["steps"]
    assert run["status"] == "done"

    error_step = next(
        s for s in steps
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
    initial = res.json()

    body = await _wait_for_terminal(client, initial["id"])
    run = body["run"]
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
    initial = res.json()

    body = await _wait_for_terminal(client, initial["id"])
    run = body["run"]
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
    initial = res.json()

    body = await _wait_for_terminal(client, initial["id"])
    run = body["run"]
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
    """Registered agent must advertise tools + kind in the UI
    descriptor — the frontend needs both to render the card + badge
    correctly."""
    desc = LlmInventoryAnalyst.describe()
    assert desc["name"] == "llm_inventory_analyst"
    assert desc["kind"] == "llm"
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
    initial = res.json()

    body = await _wait_for_terminal(client, initial["id"])
    run   = body["run"]
    steps = body["steps"]
    assert run["status"] == "done"

    error_step = next(
        s for s in steps
        if s["kind"] == "tool_result" and s["payload"].get("tool") == "list_nodes"
    )
    assert "error" in error_step["payload"]
    # Sanity: error message from pydantic is plain JSON-safe string
    assert isinstance(error_step["payload"]["error"], str)
    _ = json.dumps(error_step["payload"])  # must be serialisable


async def test_llm_agent_forwards_ui_context_into_initial_prompt(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """Context the UI ships in ``POST /runs`` (focus_country, etc.)
    must reach the LLM as part of the first user turn, so an agent
    can e.g. bias its answer toward a specific country.

    We capture the ``messages`` arg passed to ``_call_llm`` and
    verify the serialised context appears there.
    """
    captured_messages: list[dict[str, str]] = []

    async def capture(self, http, bridge, system, messages, model):  # noqa: ARG001
        # First call: record what the LLM saw. Return a final immediately.
        captured_messages.extend(messages)
        return '<final>{"summary":"ok", "total":0}</final>'

    monkeypatch.setattr(LlmInventoryAnalyst, "_call_llm", capture)

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={
            "operator": "TR",
            "prompt":   "Ülkenin sistem durumunu özetle",
            "context":  {"focus_country": "TR", "urgency": "high"},
        },
    )
    assert res.status_code == 200
    initial = res.json()
    body = await _wait_for_terminal(client, initial["id"])
    assert body["run"]["status"] == "done"

    # First message is the user turn; it must carry the context block.
    first_user = captured_messages[0]
    assert first_user["role"] == "user"
    assert "focus_country"    in first_user["content"]
    assert "TR"               in first_user["content"]
    assert "urgency"          in first_user["content"]


def test_resolve_model_prefers_ctx_override() -> None:
    """Per-run override from the UI wins over every class/deploy default."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(
        operator="TR", run_id="t", prompt="", extra={"model": "haiku"},
    )
    assert _resolve_model(ctx, "sonnet", "opus") == "haiku"


def test_resolve_model_strips_whitespace() -> None:
    """A dropdown value of ``"  sonnet  "`` — stripped, not rejected."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(
        operator="TR", run_id="t", prompt="", extra={"model": "  sonnet  "},
    )
    assert _resolve_model(ctx, "", "") == "sonnet"


def test_resolve_model_falls_through_blank_override_to_agent_default() -> None:
    """Picking "Varsayılan" in the UI ships ``"model": ""`` — it must
    defer to the agent's own pin instead of clobbering it."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(operator="TR", run_id="t", prompt="", extra={"model": ""})
    assert _resolve_model(ctx, "opus", "haiku") == "opus"


def test_resolve_model_ignores_non_string_override() -> None:
    """Defensive: context is decoded JSON, a malformed payload sending
    ``"model": 3`` must not crash the run."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(operator="TR", run_id="t", prompt="", extra={"model": 3})
    assert _resolve_model(ctx, "sonnet", "") == "sonnet"


def test_resolve_model_falls_through_missing_override() -> None:
    """No ``model`` key at all → agent default wins."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(operator="TR", run_id="t", prompt="", extra={"focus": "TR"})
    assert _resolve_model(ctx, "sonnet", "haiku") == "sonnet"


def test_resolve_model_settings_default_when_nothing_else() -> None:
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(operator="TR", run_id="t", prompt="", extra={})
    assert _resolve_model(ctx, "", "opus") == "opus"


def test_resolve_model_empty_everywhere_returns_empty() -> None:
    """Nothing set → bridge picks its own default (empty string sentinel)."""
    from tairos_api.agents.base import AgentContext
    from tairos_api.agents.llm import _resolve_model

    ctx = AgentContext(operator="TR", run_id="t", prompt="", extra={})
    assert _resolve_model(ctx, "", "") == ""


async def test_llm_agent_passes_per_run_model_to_call_llm(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """End-to-end: POST /runs with ``context.model = "haiku"`` must pass
    ``model="haiku"`` to ``_call_llm`` and the plan step must show it so
    the operator can confirm in the UI which model served the run."""
    captured: dict[str, Any] = {}

    async def capture_model(self, http, bridge, system, messages, model):  # noqa: ARG001
        captured["model"] = model
        return '<final>{"summary":"ok", "total":0}</final>'

    monkeypatch.setattr(LlmInventoryAnalyst, "_call_llm", capture_model)

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={
            "operator": "TR",
            "context":  {"model": "haiku"},
        },
    )
    assert res.status_code == 200
    initial = res.json()
    body = await _wait_for_terminal(client, initial["id"])
    assert body["run"]["status"] == "done"
    assert captured["model"] == "haiku"

    # Plan step must echo the chosen model back so the UI can display
    # "haiku" in the step body instead of "(bridge default)".
    plan_step = next(s for s in body["steps"] if s["kind"] == "plan")
    assert plan_step["payload"]["model"] == "haiku"


async def test_llm_agent_returns_pending_row_for_fast_polling(
    monkeypatch: pytest.MonkeyPatch, client: AsyncClient,
) -> None:
    """POST /runs for an LLM agent must not block on the LLM call.

    We script a reply that only resolves on the fifth scheduler tick
    so the POST response definitely comes back before the background
    task has done much — the frontend can render the pending row
    immediately and start polling.
    """
    event = asyncio.Event()

    async def slow(self, *a, **kw):  # noqa: ARG001
        # Wait until the test signals we're done inspecting the
        # pending row; only then let the agent produce its final.
        await event.wait()
        return '<final>{"summary":"geç kalınmış", "total":0}</final>'

    monkeypatch.setattr(LlmInventoryAnalyst, "_call_llm", slow)

    res = await client.post(
        "/v1/agents/llm_inventory_analyst/runs",
        json={"operator": "TR"},
    )
    assert res.status_code == 200
    initial = res.json()
    # Row is already persisted; status is pending or running
    # (the background task may have had a tick to flip status).
    assert initial["status"] in ("pending", "running")
    assert initial["result"] is None

    # Release the "LLM" and poll to completion.
    event.set()
    body = await _wait_for_terminal(client, initial["id"])
    assert body["run"]["status"] == "done"
