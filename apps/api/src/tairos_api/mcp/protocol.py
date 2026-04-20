"""JSON-RPC 2.0 request/response schemas for the MCP surface.

MCP is a conventional use of JSON-RPC — each call carries ``method``,
``params``, an ``id`` echoed back in the response, and either
``result`` or ``error``. The schemas here stay minimal: we only
validate what we dispatch on, and leave the ``params`` body for
method-specific validators to pick up.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class JsonRpcRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id:      str | int | None = None
    method:  str
    params:  dict[str, Any] = Field(default_factory=dict)


class JsonRpcError(BaseModel):
    code:    int
    message: str
    data:    Any | None = None


class JsonRpcResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id:      str | int | None = None
    result:  Any | None = None
    error:   JsonRpcError | None = None


# JSON-RPC error codes — subset of the official table, plus ours.
ERR_PARSE          = -32700
ERR_INVALID_REQ    = -32600
ERR_METHOD_MISSING = -32601
ERR_INVALID_PARAMS = -32602
ERR_INTERNAL       = -32603
# Application codes — keep well above -32000 to avoid colliding
# with JSON-RPC reserved range.
ERR_TOOL_MISSING   = 1001
ERR_TOOL_FAILED    = 1002
