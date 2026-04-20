"""Web-facing Tools.

These let an LLM agent read information from the public internet:

  * ``web_fetch``  — GET an http(s) URL, return the body as plain text
                     (HTML stripped) with a hard character cap.

The tool is deliberately narrow — no POST, no auth headers, no cookie
jar. Everything an agent might want to *write* to the internet needs a
dedicated, explicit tool (and an explicit human-in-the-loop review at
the UI layer). The surface here is: "read this URL."

SSRF defence
~~~~~~~~~~~~
The Claude Max bridge runs inside the operator's machine, which also
runs the Tairos API. An LLM that hallucinates or is prompted into
fetching ``http://127.0.0.1:8001/internal/...`` would otherwise get a
fully-authenticated response from our own server, leaking operator
data across agents and sessions.

The guard resolves the hostname once, checks every returned IP against
the standard private/loopback/link-local/multicast/reserved ranges, and
refuses the call *before* the socket opens. It does not defend against
DNS rebinding (second resolution during connect) — that's an acceptable
gap for a local, single-operator dev tool and is called out in the
README so the risk is documented rather than hidden.
"""
from __future__ import annotations

import re
from html import unescape
from typing import Any

import httpx
from pydantic import BaseModel, Field, HttpUrl

from ..tool import Tool, ToolContext
from ._net import guard_url

# ── HTML → text helpers ──────────────────────────────────────
# We intentionally keep this *very* rough. BeautifulSoup would do a
# better job but adds a dep (+transitive soupsieve) for modest gain:
# agents only need enough text to reason over headlines and a lead
# paragraph; polished rendering is the UI's problem, not the LLM's.
_SCRIPT_RE     = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE        = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def html_to_text(html: str) -> str:
    """Crude HTML→plain-text:
    1. drop ``<script>`` / ``<style>`` blocks (noise),
    2. strip every remaining tag (keep inner text),
    3. unescape entities (``&amp;`` → ``&``),
    4. collapse whitespace.

    Returns a single-paragraph string; line structure is lost, which is
    acceptable because the LLM does not need it to infer meaning.
    """
    html = _SCRIPT_RE.sub(" ", html)
    html = _TAG_RE.sub(" ", html)
    html = unescape(html)
    return _WHITESPACE_RE.sub(" ", html).strip()


# SSRF defence: ``guard_url`` is imported from ``_net`` so the same
# policy covers every web-facing tool in this package. See that module
# for the rules + the documented DNS-rebinding gap.


# ─────────────────────────────────────────────────────────────
# web_fetch
# ─────────────────────────────────────────────────────────────
class WebFetchInput(BaseModel):
    url:       HttpUrl = Field(..., description="Public http(s) URL to fetch.")
    max_chars: int     = Field(
        default=4000, ge=200, le=20_000,
        description="Cap on returned body length. Larger values cost "
                    "more LLM context; 4k is usually enough.",
    )


class WebFetchOutput(BaseModel):
    url:          str
    status:       int
    content_type: str
    text:         str
    truncated:    bool


class WebFetchTool(Tool):
    name          = "web_fetch"
    description   = (
        "Fetch a public http(s) URL and return its body as plain text "
        "(HTML stripped, whitespace collapsed). Private/loopback/"
        "link-local addresses are refused. The response body is capped "
        "at `max_chars` characters — anything longer is truncated and "
        "`truncated: true` is returned so the caller can choose to "
        "narrow its query instead of re-fetching."
    )
    input_schema  = WebFetchInput
    output_schema = WebFetchOutput

    # Short-ish timeout: LLM turns already feel slow and a stuck fetch
    # blocks the whole run. Operators would rather see "timeout" and
    # have the agent adapt than stare at a spinner.
    timeout_seconds: float = 10.0

    async def run(self, payload: WebFetchInput, ctx: ToolContext) -> dict[str, Any]:
        url = str(payload.url)
        guard_url(url)

        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            follow_redirects=True,
            max_redirects=3,
        ) as http:
            res = await http.get(url)

        ct   = res.headers.get("content-type", "") or ""
        body = res.text
        if "html" in ct.lower():
            body = html_to_text(body)

        truncated = len(body) > payload.max_chars
        if truncated:
            body = body[: payload.max_chars]

        # ``str(res.url)`` returns the final URL after redirects; the
        # LLM sees it so a redirected fetch is unambiguous.
        return {
            "url":          str(res.url),
            "status":       res.status_code,
            "content_type": ct,
            "text":         body,
            "truncated":    truncated,
        }
