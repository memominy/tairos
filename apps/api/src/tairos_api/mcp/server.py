"""FastAPI router that exposes the MCP surface.

Mounted at ``/v1/mcp``. The two methods implemented today are enough
for a downstream agent client to:
  1. call ``tools/list`` once to discover what's available,
  2. call ``tools/call`` per invocation.

A single POST endpoint handles both (it's JSON-RPC, the method goes
in the body). That keeps the API surface under one URL, which is how
MCP consumers expect it.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter
from pydantic import ValidationError

from ..agents.registry import registry
from ..agents.tool import ToolContext
from .protocol import (
    ERR_INTERNAL,
    ERR_INVALID_PARAMS,
    ERR_METHOD_MISSING,
    ERR_TOOL_FAILED,
    ERR_TOOL_MISSING,
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
)

router = APIRouter(prefix="/v1/mcp", tags=["mcp"])


def _err(req_id: str | int | None, code: int, message: str, data=None) -> JsonRpcResponse:
    return JsonRpcResponse(id=req_id, error=JsonRpcError(code=code, message=message, data=data))


@router.post("", response_model=JsonRpcResponse)
async def mcp_endpoint(req: JsonRpcRequest) -> JsonRpcResponse:
    # ── tools/list ───────────────────────────────────────────
    if req.method == "tools/list":
        return JsonRpcResponse(
            id=req.id,
            result={"tools": [t.__class__.describe() for t in registry.list_tools()]},
        )

    # ── tools/call ───────────────────────────────────────────
    if req.method == "tools/call":
        name      = req.params.get("name")
        arguments = req.params.get("arguments", {}) or {}
        ctx_bag   = req.params.get("context", {}) or {}

        if not name:
            return _err(req.id, ERR_INVALID_PARAMS, "Missing 'name' in params")

        tool = registry.get_tool(name)
        if tool is None:
            return _err(req.id, ERR_TOOL_MISSING, f"Unknown tool: {name}")

        # Tools must run under an operator scope. Default to the
        # special ``mcp`` operator if the client omits it — that
        # way ad-hoc CLI invocations don't silently bleed into real
        # operator data.
        ctx = ToolContext(
            operator=ctx_bag.get("operator", "mcp"),
            run_id=ctx_bag.get("run_id", f"mcp-{uuid.uuid4()}"),
            extra={k: v for k, v in ctx_bag.items() if k not in ("operator", "run_id")},
        )

        try:
            payload = tool.input_schema.model_validate(arguments)
        except ValidationError as exc:
            return _err(req.id, ERR_INVALID_PARAMS, "Invalid tool arguments", data=exc.errors())

        try:
            output = await tool.run(payload, ctx)
        except Exception as exc:
            return _err(req.id, ERR_TOOL_FAILED, f"Tool '{name}' failed: {exc}")

        return JsonRpcResponse(id=req.id, result=output)

    return _err(req.id, ERR_METHOD_MISSING, f"Unknown method: {req.method}")


# ── Convenience non-JSON-RPC routes for UI discoverability ──
# These are tiny shortcuts for the frontend agent panel — useful
# when the UI wants a straight GET, not a JSON-RPC envelope.
@router.get("/tools")
async def list_tools():
    return {"tools": [t.__class__.describe() for t in registry.list_tools()]}
