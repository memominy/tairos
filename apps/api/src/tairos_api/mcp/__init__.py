"""Model Context Protocol (MCP) surface.

MCP is a simple JSON-RPC 2.0 protocol for exposing tools to agents.
This package is the server-side implementation: it wraps the internal
``agents.registry`` tool set and speaks MCP over HTTP. When an LLM
client (Claude Desktop, a local agent harness, a WebSocket consumer)
asks "what tools are available?" we answer from the registry, and
when it asks to invoke one we dispatch through the same code path
the in-process agents use.

What's implemented vs. not
~~~~~~~~~~~~~~~~~~~~~~~~~~
Implemented:
  * ``tools/list``   — returns every registered tool's descriptor.
  * ``tools/call``   — invokes one tool with a payload + context
                       (operator, run id if any).

Not implemented yet:
  * Resources, prompts, sampling. These are separate MCP method
    families that we don't currently need.
  * stdio transport. We only expose HTTP + JSON right now; stdio can
    layer on top trivially when a subprocess harness wants it.
"""
