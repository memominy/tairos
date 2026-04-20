"""Unit tests for the rss_fetch tool.

Coverage:
  * ``_parse_feed`` handles RSS 2.0 and Atom with equal care.
  * HTML inside ``<description>`` is stripped to plain text — the LLM
    should see "Minsk talks stall" not ``<p>Minsk <em>talks</em>...``.
  * The feed title falls through sensibly for malformed feeds.
  * Truly broken XML raises a clean ``ValueError`` (no traceback leak).
  * The SSRF guard fires before any HTTP call when the feed URL points
    at a private address (same safety property as web_fetch).
"""
from __future__ import annotations

import socket
from typing import Any

import httpx
import pytest

from tairos_api.agents.tool import ToolContext
from tairos_api.agents.tools.rss import (
    RssFetchInput,
    RssFetchTool,
    _parse_feed,
)


# ── Helpers shared with test_web_tool.py style ─────────────────
def _fake_getaddrinfo(mapping: dict[str, list[str]]):
    def _f(host: str, port, *_, **__):  # noqa: ARG001
        ips = mapping.get(host)
        if ips is None:
            raise socket.gaierror(-2, "Name or service not known")
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, 0)) for ip in ips]
    return _f


def _install_fake_httpx(
    monkeypatch: pytest.MonkeyPatch,
    *,
    status: int = 200,
    content_type: str = "application/rss+xml",
    body: bytes,
) -> dict[str, Any]:
    captured: dict[str, Any] = {"calls": []}

    async def fake_get(self, url, **_kw):  # noqa: ARG001
        captured["calls"].append(url)
        req = httpx.Request("GET", url)
        return httpx.Response(
            status_code=status,
            headers={"content-type": content_type},
            content=body,
            request=req,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    return captured


# ── _parse_feed: RSS 2.0 ──────────────────────────────────────
_RSS20_SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>TR Haber</title>
    <link>https://example.com/</link>
    <description>Haber akışı</description>
    <item>
      <title>Güney cephesinde gerilim</title>
      <link>https://example.com/a</link>
      <description><![CDATA[<p>Sınır bölgesinde <b>hareketlilik</b></p>]]></description>
      <pubDate>Thu, 10 Apr 2026 08:30:00 GMT</pubDate>
    </item>
    <item>
      <title>NATO toplantısı</title>
      <link>https://example.com/b</link>
      <description>Brüksel zirvesi</description>
      <pubDate>Wed, 09 Apr 2026 20:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
"""


def test_parse_feed_rss20_extracts_items() -> None:
    out = _parse_feed(_RSS20_SAMPLE, "https://example.com/feed", limit=10)
    assert out["title"] == "TR Haber"
    assert len(out["items"]) == 2
    first = out["items"][0]
    assert first["title"]     == "Güney cephesinde gerilim"
    assert first["link"]      == "https://example.com/a"
    # HTML inside CDATA description is stripped down to plain text.
    assert first["summary"]   == "Sınır bölgesinde hareketlilik"
    assert first["published"] == "Thu, 10 Apr 2026 08:30:00 GMT"


def test_parse_feed_respects_limit() -> None:
    out = _parse_feed(_RSS20_SAMPLE, "https://example.com/feed", limit=1)
    assert len(out["items"]) == 1
    assert out["items"][0]["title"] == "Güney cephesinde gerilim"


# ── _parse_feed: Atom ────────────────────────────────────────
_ATOM_SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>US Intel Wire</title>
  <link href="https://intel.example/" rel="self"/>
  <updated>2026-04-10T10:00:00Z</updated>
  <entry>
    <title>Pacific posture shift</title>
    <link href="https://intel.example/2026/04/pacific" rel="alternate"/>
    <link href="https://intel.example/2026/04/pacific.pdf" rel="enclosure"/>
    <published>2026-04-10T09:00:00Z</published>
    <summary>Carrier group repositioning.</summary>
  </entry>
  <entry>
    <title>Arctic patrol</title>
    <link href="https://intel.example/2026/04/arctic"/>
    <published>2026-04-09T22:00:00Z</published>
    <summary type="html">&lt;p&gt;Route &lt;b&gt;open&lt;/b&gt;&lt;/p&gt;</summary>
  </entry>
</feed>
"""


def test_parse_feed_atom_picks_alternate_link() -> None:
    out = _parse_feed(_ATOM_SAMPLE, "https://intel.example/feed", limit=10)
    assert out["title"] == "US Intel Wire"
    assert len(out["items"]) == 2

    first = out["items"][0]
    # Must NOT pick the rel="enclosure" URL; must pick rel="alternate".
    assert first["link"]      == "https://intel.example/2026/04/pacific"
    assert first["published"] == "2026-04-10T09:00:00Z"

    # Entry with rel omitted → default alternate, link still resolved.
    assert out["items"][1]["link"] == "https://intel.example/2026/04/arctic"
    # Atom type="html" summary: entity-decoded then tag-stripped.
    assert out["items"][1]["summary"] == "Route open"


# ── _parse_feed: resilience ──────────────────────────────────
def test_parse_feed_empty_channel_returns_no_items() -> None:
    xml = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Sessiz</title></channel></rss>
"""
    out = _parse_feed(xml, "https://example.com/feed", limit=10)
    assert out["title"] == "Sessiz"
    assert out["items"] == []


def test_parse_feed_missing_title_falls_back() -> None:
    xml = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Sadece makale</title></item></channel></rss>
"""
    out = _parse_feed(xml, "https://example.com/feed", limit=10)
    # Channel has no <title>, item does — but item title must not be
    # misread as the feed title.
    assert out["title"] == "(başlık yok)"
    assert out["items"][0]["title"] == "Sadece makale"


def test_parse_feed_raises_on_broken_xml() -> None:
    with pytest.raises(ValueError, match="feed parse error"):
        _parse_feed(b"<rss>not closed", "https://example.com/feed", limit=10)


# ── RssFetchTool.run end-to-end ──────────────────────────────
async def test_rss_fetch_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "example.com": ["93.184.216.34"],
    }))
    _install_fake_httpx(monkeypatch, body=_RSS20_SAMPLE)

    tool = RssFetchTool()
    ctx  = ToolContext(operator="TR", run_id="t")
    out  = await tool.run(RssFetchInput(url="https://example.com/rss"), ctx)

    assert out["title"] == "TR Haber"
    assert [i["title"] for i in out["items"]] == [
        "Güney cephesinde gerilim",
        "NATO toplantısı",
    ]


async def test_rss_fetch_refuses_private_url_before_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same safety invariant as web_fetch: private-IP resolution must
    short-circuit the call before httpx opens a socket."""
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo({
        "attacker.example": ["10.0.0.7"],
    }))
    captured = _install_fake_httpx(monkeypatch, body=_RSS20_SAMPLE)

    tool = RssFetchTool()
    ctx  = ToolContext(operator="TR", run_id="t")
    with pytest.raises(ValueError, match="private/loopback"):
        await tool.run(RssFetchInput(url="http://attacker.example/feed"), ctx)

    assert captured["calls"] == []
