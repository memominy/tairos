"""Unit tests for the web_fetch tool.

We test at three levels:

  * ``_html_to_text`` — pure function, deterministic.
  * ``_guard_url``    — SSRF gate. We fake ``socket.getaddrinfo`` so
                        the tests don't depend on DNS state.
  * ``WebFetchTool.run`` — the top-level call, with a fake httpx client
                            installed. Verifies truncation, HTML/text
                            branching, and the SSRF guard firing *before*
                            the HTTP request so a poisoned URL can't
                            hit the socket even once.
"""
from __future__ import annotations

import socket
from typing import Any

import httpx
import pytest

from tairos_api.agents.tool import ToolContext
from tairos_api.agents.tools.web import (
    WebFetchInput,
    WebFetchTool,
    _guard_url,
    _html_to_text,
)


# ── _html_to_text ─────────────────────────────────────────────
def test_html_to_text_strips_tags_and_unescapes() -> None:
    html = "<p>Hello &amp; <b>world</b></p>"
    assert _html_to_text(html) == "Hello & world"


def test_html_to_text_drops_script_and_style_blocks() -> None:
    html = (
        "<html><head><style>body{color:red}</style></head>"
        "<body>Before<script>alert('boom')</script>After</body></html>"
    )
    out = _html_to_text(html)
    assert "alert" not in out
    assert "color:red" not in out
    assert "Before" in out and "After" in out


def test_html_to_text_collapses_whitespace() -> None:
    html = "<p>one\n\n\ntwo\t\tthree</p>"
    assert _html_to_text(html) == "one two three"


# ── _guard_url ────────────────────────────────────────────────
def _fake_getaddrinfo(mapping: dict[str, list[str]]):
    """Return a ``getaddrinfo``-shaped function backed by a host→IPs map.

    Real getaddrinfo tuples are 5-element: (family, type, proto, canon,
    sockaddr). _guard_url only uses ``info[4][0]``, so we pack minimal
    tuples but keep the shape so the code-under-test is exercised on
    realistic input.
    """
    def _f(host: str, port, *_, **__):  # noqa: ARG001
        ips = mapping.get(host)
        if ips is None:
            raise socket.gaierror(-2, "Name or service not known")
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, 0)) for ip in ips]
    return _f


def test_guard_url_refuses_non_http_scheme() -> None:
    with pytest.raises(ValueError, match="refused scheme"):
        _guard_url("file:///etc/passwd")


def test_guard_url_refuses_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "localhost": ["127.0.0.1"],
    }))
    with pytest.raises(ValueError, match="private/loopback"):
        _guard_url("http://localhost:8001/")


def test_guard_url_refuses_private_range(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "intranet.local": ["10.0.0.5"],
    }))
    with pytest.raises(ValueError, match="private/loopback"):
        _guard_url("http://intranet.local/path")


def test_guard_url_refuses_ipv6_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake(host, port, *_, **__):  # noqa: ARG001
        return [(socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::1", 0, 0, 0))]
    monkeypatch.setattr(socket, "getaddrinfo", _fake)
    with pytest.raises(ValueError, match="private/loopback"):
        _guard_url("http://v6only/")


def test_guard_url_rejects_unresolvable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({}))
    with pytest.raises(ValueError, match="cannot resolve"):
        _guard_url("http://no-such-host.example/")


def test_guard_url_accepts_public_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "example.com": ["1.1.1.1"],
    }))
    # Must not raise.
    _guard_url("https://example.com/path?x=1")


# ── WebFetchTool.run ─────────────────────────────────────────
def _install_fake_httpx(
    monkeypatch: pytest.MonkeyPatch,
    *,
    status: int = 200,
    content_type: str = "text/html; charset=utf-8",
    body: str = "<h1>Hi</h1>",
) -> dict[str, Any]:
    """Install a fake ``httpx.AsyncClient.get`` and return a capture
    dict the test can read afterwards ({'calls': [urls], 'last_url': ...}).
    """
    captured: dict[str, Any] = {"calls": []}

    async def fake_get(self, url, **_kw):  # noqa: ARG001
        captured["calls"].append(url)
        req = httpx.Request("GET", url)
        return httpx.Response(
            status_code=status,
            headers={"content-type": content_type},
            content=body.encode("utf-8"),
            request=req,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    return captured


async def test_web_fetch_happy_path_strips_html(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "example.com": ["93.184.216.34"],
    }))
    _install_fake_httpx(
        monkeypatch,
        content_type="text/html",
        body="<p>Hello <b>world</b></p>",
    )

    tool = WebFetchTool()
    payload = WebFetchInput(url="https://example.com/")
    ctx = ToolContext(operator="TR", run_id="test")
    out = await tool.run(payload, ctx)

    assert out["status"]       == 200
    assert out["content_type"] == "text/html"
    assert out["text"]         == "Hello world"
    assert out["truncated"]    is False


async def test_web_fetch_leaves_non_html_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "api.example.com": ["93.184.216.34"],
    }))
    _install_fake_httpx(
        monkeypatch,
        content_type="application/json",
        body='{"hello":"world"}',
    )

    tool = WebFetchTool()
    payload = WebFetchInput(url="https://api.example.com/data")
    ctx = ToolContext(operator="TR", run_id="test")
    out = await tool.run(payload, ctx)

    # JSON body passes through as-is; the LLM can parse it if it wants.
    assert out["text"] == '{"hello":"world"}'


async def test_web_fetch_truncates_long_bodies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "big.example.com": ["93.184.216.34"],
    }))
    big = "a" * 10_000
    _install_fake_httpx(monkeypatch, content_type="text/plain", body=big)

    tool = WebFetchTool()
    payload = WebFetchInput(url="https://big.example.com/", max_chars=500)
    ctx = ToolContext(operator="TR", run_id="test")
    out = await tool.run(payload, ctx)

    assert out["truncated"] is True
    assert len(out["text"]) == 500


async def test_web_fetch_refuses_private_url_before_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Crucial safety test: when the URL resolves to a private IP the
    HTTP call must never happen, even at the socket level. We verify
    this by installing a capture-fake over httpx.AsyncClient.get and
    asserting it was not invoked."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "attacker.example": ["127.0.0.1"],
    }))
    captured = _install_fake_httpx(monkeypatch)

    tool = WebFetchTool()
    payload = WebFetchInput(url="http://attacker.example/api/internal")
    ctx = ToolContext(operator="TR", run_id="test")
    with pytest.raises(ValueError, match="private/loopback"):
        await tool.run(payload, ctx)

    assert captured["calls"] == []
