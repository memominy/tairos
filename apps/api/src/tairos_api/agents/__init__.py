"""Agent runtime.

High-level design
-----------------
An **Agent** is a named pipeline that takes a prompt + a context
(operator, focus country, active filters, …) and produces a stream of
**steps**. Each step is one of:

    plan        — the agent's intent for the next action
    tool_call   — a structured call to a registered Tool
    tool_result — the Tool's response payload
    final       — the agent's terminal answer

Steps are persisted to the ``agent_step`` table as they happen, so a
UI can poll ``GET /v1/agents/runs/{id}`` and replay the run without
streaming. A websocket/SSE layer can be added later to push updates
in real time.

Why this shape?
~~~~~~~~~~~~~~~
* Matches the MCP (Model Context Protocol) mental model: agents
  interact with the world through Tools with typed schemas.
* Deterministic agents (no LLM) and LLM-driven agents share the same
  storage format — swapping one for the other is a per-agent change,
  not a platform change.
* The UI can render a run as a timeline without caring how the agent
  was implemented.

Slots intentionally left empty
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
* **LLM binding.** The framework has no Anthropic/OpenAI client yet.
  When an operator provisions credentials (Claude Max CLI via the
  existing scripts/assistant-server.mjs, a direct SDK call, or a
  local Ollama), that slot gets filled by a concrete subclass of
  ``LlmAgent``.
* **Streaming.** Current runtime persists steps only. SSE is a
  straight port on top — the event loop already yields per step.
"""
