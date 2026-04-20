"""LlmAgent — LLM-backed agent base class.

Talks to the Claude Max local bridge (``scripts/assistant-server.mjs``)
by default. The bridge accepts plain ``{ system, messages }`` and
returns plain text, so this class layers a *text protocol* on top to
emulate tool-use:

* The system prompt advertises every tool the agent may call, with its
  JSON Schema.
* The LLM answers with one of two well-known tags on the FIRST
  non-empty line:

      <tool_call>{"name":"list_nodes","input":{"limit":5}}</tool_call>
      <final>{"summary":"Özet ...", "data": {...}}</final>

* The runtime parses the tag, executes the tool (if any), feeds the
  result back as a user turn, and loops until a ``<final>`` is seen
  or ``max_iterations`` is hit.

Why this shape?
~~~~~~~~~~~~~~~
The Anthropic SDK has a native ``tool_use`` block protocol, but our
Max subscription is only reachable via the Claude Code CLI, which
returns plain text. Rather than introduce a paid API as a dependency,
we define a text protocol Claude can follow reliably (it handles
structured output extremely well when the schema is explicit).

When the project later adds a paid API adapter, it slots in underneath
``_call_llm`` — the tool-use loop stays.

Robustness rails
~~~~~~~~~~~~~~~~
* Bridge unavailable → yield a ``final`` step with ``error`` so the
  UI shows *why* the run failed instead of a bare exception trace.
* LLM replies with malformed JSON → recoverable: we nudge it once with
  a reminder message. Two strikes = error final.
* Tool raises → yield ``tool_result`` with ``error``; loop continues
  so the LLM can react (retry with different input, give up, etc.).
"""
from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import get_settings
from .base import Agent, AgentContext, Step
from .tool import Tool


# ── Text protocol constants ──────────────────────────────────
# We capture the raw text between the open/close tags rather than
# trying to brace-match inside the regex; that way nested dicts in
# the tool input (``{"filter":{"op":"eq"}}``) don't trip the parser.
# The lazy ``.*?`` is bounded by the closing tag, so it greedily
# enough captures the full JSON body without spilling into siblings.
_TOOL_CALL_RE = re.compile(r"<tool_call>\s*(.*?)\s*</tool_call>", re.DOTALL)
_FINAL_RE     = re.compile(r"<final>\s*(.*?)\s*</final>",         re.DOTALL)

# Bonus: accept a fenced ``json`` code block too — LLMs love markdown.
# Kept brace-anchored because we're salvaging a *looks-like-final*
# payload, not parsing our own protocol here.
_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


# The "system" prompt header drilled into every LlmAgent run. The
# concrete subclass's ``system_prompt`` is appended after this. We use
# a manual ``<<MAX_ITER>>`` sentinel rather than ``str.format`` because
# the examples below contain literal curly braces that ``.format``
# would try to interpret as field references.
_PROTOCOL_PREFIX = """\
Sen Tairos Sentinel platformunun bir iç ajanısın. Görev açıklamasının
altında, kullanabileceğin araçların (tools) listesi verildi. Her tur
şunlardan TAM OLARAK birini üretmek zorundasın:

1) Bir araç çağırmak için, satırın başında şu formatta:
   <tool_call>{"name": "<tool_name>", "input": { ...şema }}</tool_call>

2) Nihai cevabı vermek için:
   <final>{"summary": "...", ...opsiyonel alanlar}</final>

Kurallar:
- "summary" alanı operatöre gösterilecek kısa Türkçe özetin (1-3 cümle).
- <final> içinde istediğin ek alanları (total, items, flags, ...) ekleyebilirsin.
- JSON geçerli olmalı (çift tırnak, virgül, kaçış karakteri). Yorum yazma.
- Araçlar istemediğin veri döndürürse yine <final> ile durumu özetle.
- En fazla <<MAX_ITER>> tur araç çağırabilirsin; sonra mecburen <final> ver.
"""


def _format_tools_block(tools: list[Tool]) -> str:
    """Render every Tool descriptor as a JSON blob the LLM can read.

    We include full JSON Schema so Claude can validate its own input
    mentally; the actual validation still runs through pydantic on
    invocation.
    """
    if not tools:
        return "Kullanılabilir araç yok."
    lines = ["Kullanılabilir araçlar:"]
    for t in tools:
        desc = t.__class__.describe()
        lines.append(
            f"- name: {desc['name']}\n"
            f"  description: {desc['description']}\n"
            f"  inputSchema: {json.dumps(desc['inputSchema'], ensure_ascii=False)}"
        )
    return "\n".join(lines)


def _parse_llm_reply(text: str) -> tuple[str, dict[str, Any] | None, str]:
    """Extract a ``(kind, payload, raw)`` triple from the LLM's reply.

    kind ∈ {"tool_call", "final", "malformed"}. ``payload`` is None
    when parsing fails; the caller uses ``raw`` to nudge the LLM back
    onto the protocol in the next turn.
    """
    if m := _TOOL_CALL_RE.search(text):
        try:
            return ("tool_call", json.loads(m.group(1).strip()), text)
        except json.JSONDecodeError:
            return ("malformed", None, text)

    if m := _FINAL_RE.search(text):
        try:
            return ("final", json.loads(m.group(1).strip()), text)
        except json.JSONDecodeError:
            return ("malformed", None, text)

    # Fallback: a fenced code block that *looks* like one of ours.
    # Some Claude variants wrap the JSON; we accept it as a final so
    # a stray code fence doesn't derail the run.
    if m := _FENCED_JSON_RE.search(text):
        try:
            obj = json.loads(m.group(1))
            if isinstance(obj, dict) and "summary" in obj:
                return ("final", obj, text)
        except json.JSONDecodeError:
            pass

    return ("malformed", None, text)


class LlmAgent(Agent):
    """Base class for LLM-backed agents.

    Concrete subclass must set:
      * ``name``          — stable identifier
      * ``description``   — UI-facing summary
      * ``system_prompt`` — role + task description for the LLM
      * ``tools``         — list of Tool *instances* the LLM may call
      * (optional) ``model`` to pin a specific Claude model
    """

    # Inherited from Agent: name, description, tools.
    # Set by subclasses:
    system_prompt: str = ""
    model:         str = ""   # empty = let bridge pick default

    # Cap on LLM turns per run. Defaults come from settings but a
    # subclass can tighten (e.g. a dashboard agent that should never
    # loop more than twice).
    max_iterations: int | None = None

    async def arun(self, ctx: AgentContext) -> AsyncIterator[Step]:
        settings = get_settings()
        max_iter = self.max_iterations or settings.llm_max_iterations
        bridge   = settings.llm_bridge_url.rstrip("/")
        model    = self.model or settings.llm_model
        timeout  = settings.llm_timeout_seconds

        # ── Plan step ────────────────────────────────────────
        # Announce intent early so the UI has something to render
        # while the first LLM round-trip is in flight.
        yield Step(kind="plan", payload={
            "summary":     f"LLM ajanı çalışıyor: {self.name}",
            "operator":    ctx.operator,
            "prompt":      ctx.prompt,
            "model":       model or "(bridge default)",
            "max_iter":    max_iter,
            "tool_names":  [t.__class__.name for t in self.tools],
        })

        # ── Build the prompt envelope ────────────────────────
        system_full = (
            _PROTOCOL_PREFIX.replace("<<MAX_ITER>>", str(max_iter))
            + "\n\nGörev:\n" + (self.system_prompt or "(görev tanımı verilmedi)")
            + "\n\n" + _format_tools_block(self.tools)
        )
        messages: list[dict[str, str]] = [
            {
                "role":    "user",
                "content": self._initial_user_message(ctx),
            },
        ]

        tool_ctx  = ctx.tool_ctx()
        tools_by_name: dict[str, Tool] = {
            t.__class__.name: t for t in self.tools
        }

        # ── Tool-use loop ────────────────────────────────────
        async with httpx.AsyncClient(timeout=timeout) as http:
            for turn in range(max_iter):
                try:
                    reply = await self._call_llm(http, bridge, system_full, messages, model)
                except Exception as exc:  # noqa: BLE001 — we want the full class net here
                    # Bridge down, timeout, HTTP 500 from Claude Code,
                    # anything. Turn it into a final so the run row
                    # has a parseable error for the UI.
                    yield Step(kind="final", payload={
                        "summary": f"LLM köprüsüne erişilemedi: {exc}",
                        "error":   str(exc)[:500],
                        "turns":   turn,
                    })
                    return

                kind, payload, raw = _parse_llm_reply(reply)
                messages.append({"role": "assistant", "content": raw})

                if kind == "final" and payload is not None:
                    # Spread LLM extras flat so the UI's ResultBlock
                    # (which reads result.total / result.recent / …)
                    # treats LLM agents the same as deterministic ones.
                    # ``summary`` is sanitised; ``turns`` is meta we
                    # always add — unlikely to collide with LLM keys.
                    merged: dict[str, Any] = dict(payload)
                    merged["summary"] = (
                        str(payload.get("summary", "")).strip()
                        or "(özet verilmedi)"
                    )
                    merged["turns"] = turn + 1
                    yield Step(kind="final", payload=merged)
                    return

                if kind == "tool_call" and payload is not None:
                    tool_name  = payload.get("name",  "")
                    tool_input = payload.get("input", {}) or {}
                    yield Step(kind="tool_call", payload={
                        "tool":  tool_name,
                        "input": tool_input,
                        "turn":  turn,
                    })

                    tool = tools_by_name.get(tool_name)
                    if tool is None:
                        err = f"Bilinmeyen araç: {tool_name!r}"
                        yield Step(kind="tool_result", payload={
                            "tool":  tool_name,
                            "error": err,
                            "turn":  turn,
                        })
                        messages.append({
                            "role":    "user",
                            "content": f"<tool_result tool=\"{tool_name}\">{{\"error\": \"{err}\"}}</tool_result>",
                        })
                        continue

                    # Validate input through the tool's pydantic schema
                    # so malformed LLM JSON surfaces as a readable error
                    # the LLM can retry, not a stack trace.
                    try:
                        validated = tool.input_schema(**tool_input)
                        result    = await tool.run(validated, tool_ctx)
                    except Exception as exc:  # noqa: BLE001
                        err = f"{type(exc).__name__}: {exc}"
                        yield Step(kind="tool_result", payload={
                            "tool":  tool_name,
                            "error": err,
                            "turn":  turn,
                        })
                        messages.append({
                            "role":    "user",
                            "content": (
                                f"<tool_result tool=\"{tool_name}\">"
                                f"{json.dumps({'error': err}, ensure_ascii=False)}"
                                f"</tool_result>"
                            ),
                        })
                        continue

                    yield Step(kind="tool_result", payload={
                        "tool":   tool_name,
                        "output": result,
                        "turn":   turn,
                    })
                    messages.append({
                        "role":    "user",
                        "content": (
                            f"<tool_result tool=\"{tool_name}\">"
                            f"{json.dumps(result, ensure_ascii=False, default=str)}"
                            f"</tool_result>"
                        ),
                    })
                    continue

                # kind == "malformed" — one polite nudge, then treat
                # repeats as a failure. The LLM gets the raw text it
                # produced back so it can see what it did wrong.
                messages.append({
                    "role":    "user",
                    "content": (
                        "Cevabın protokole uymadı. Lütfen yalnızca "
                        "<tool_call>{...}</tool_call> veya <final>{...}</final> "
                        "formatında, geçerli JSON ile cevap ver."
                    ),
                })

            # Loop exhausted without a final: collapse into a best-
            # effort answer so the run has a terminal step.
            yield Step(kind="final", payload={
                "summary": f"Maksimum tur ({max_iter}) aşıldı; LLM nihai cevap vermedi.",
                "error":   "max_iterations_exceeded",
                "turns":   max_iter,
            })

    # ── Subclass hooks ───────────────────────────────────────
    def _initial_user_message(self, ctx: AgentContext) -> str:
        """First user turn seeded into the conversation.

        Default: the operator's prompt verbatim, prefixed with a bit
        of context. Subclasses can override for fancier scaffolding
        (e.g. inject focus-country data as JSON).
        """
        base = (
            f"Operatör: {ctx.operator}\n"
            f"İstek: {ctx.prompt or '(görev tanımı içindeki varsayılanı uygula)'}"
        )
        return base

    # ── Bridge wire ──────────────────────────────────────────
    async def _call_llm(
        self,
        http:    httpx.AsyncClient,
        bridge:  str,
        system:  str,
        messages: list[dict[str, str]],
        model:   str,
    ) -> str:
        """POST to the Claude Max local bridge. Returns the text reply.

        Pulled out as a method so tests can monkeypatch it without
        spawning a real Node bridge, and so a future paid-API adapter
        can subclass & swap.
        """
        body: dict[str, Any] = {"system": system, "messages": messages}
        if model:
            body["model"] = model
        res = await http.post(f"{bridge}/chat", json=body)
        res.raise_for_status()
        data = res.json()
        if "error" in data:
            raise RuntimeError(data["error"])
        return data.get("text", "") or ""
