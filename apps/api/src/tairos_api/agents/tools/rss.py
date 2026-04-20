"""RSS/Atom feed Tool.

Companion to ``web_fetch``: where that reads a single URL, ``rss_fetch``
ingests a feed and returns a normalised list of items. This is the
primitive the news-scanning agents reach for — "give me the last N
headlines from source X" — without paying the cost of an LLM having to
reason over HTML wrappers on a news index page.

Format coverage
~~~~~~~~~~~~~~~
Both **RSS 2.0** and **Atom** are in scope. We parse with the stdlib
``xml.etree.ElementTree`` and strip namespaces up front so the two
schemas converge into the same walk:

    RSS 2.0: <rss><channel><title>…</title><item><title/><link>…</link>
             <description/><pubDate/></item>...</channel></rss>

    Atom:    <feed><title>…</title><entry><title/>
             <link href="…" rel="alternate"/><summary/><published/>
             </entry>...</feed>

Why stdlib instead of ``feedparser``?
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
``feedparser`` is the universal Python RSS library but it pulls several
transitive deps and does aggressive normalization (date parsing,
link resolution, sanitisation) that the LLM doesn't need — it reads
the raw strings fine. Staying stdlib keeps the dependency footprint
tiny and the parse logic reviewable in one file.

SSRF / body caps
~~~~~~~~~~~~~~~~
Same ``guard_url`` as ``web_fetch`` (refuses private/loopback etc.)
and the tool reads ``response.content`` (bytes) without length check —
feeds are tiny in practice (usually <200 KB). If that proves wrong
later we add a streaming read with a max-size guard; for now keeping
the code flat is the right trade.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

import httpx
from pydantic import BaseModel, Field, HttpUrl

from ..tool import Tool, ToolContext
from ._net import guard_url
from .web   import html_to_text


# ── Parsing helpers ─────────────────────────────────────────
def _strip_namespaces(root: ET.Element) -> None:
    """Rewrite ``{namespace}tag`` to bare ``tag`` in-place.

    Atom feeds always use ``http://www.w3.org/2005/Atom`` as the
    default namespace, so ElementTree's ``find("title")`` won't match
    ``<title xmlns="http://www.w3.org/2005/Atom">`` without the full
    Clark notation. Stripping up front means the rest of the parser
    reads like it's walking a namespace-free XML tree.
    """
    for elem in root.iter():
        tag = elem.tag
        if isinstance(tag, str) and "}" in tag:
            elem.tag = tag.split("}", 1)[1]


def _text_of(node: ET.Element | None, tag: str) -> str | None:
    """Find ``<tag>`` as a direct child and return stripped text, or None."""
    if node is None:
        return None
    child = node.find(tag)
    if child is None or child.text is None:
        return None
    return child.text.strip() or None


def _feed_title(root: ET.Element) -> str:
    """Best-effort feed title.

    Preference order — ``channel/title`` (RSS 2.0) → root ``title`` (Atom)
    → bare "(başlık yok)" when neither is present. We don't descend into
    items because some malformed feeds have a ``<title>`` inside the
    first item only — that title belongs to the article, not the feed.
    """
    for container in ("channel", "feed"):
        ct = root.find(container)
        if ct is not None:
            t = _text_of(ct, "title")
            if t:
                return t
    t = _text_of(root, "title")
    return t or "(başlık yok)"


def _entry_link(entry: ET.Element) -> str:
    """Pull the canonical article URL out of an RSS item or Atom entry.

    * Atom: ``<link href="..." rel="alternate"/>`` — the canonical
      article URL. We accept missing ``rel`` (defaults to alternate)
      and skip ``rel="self"`` / ``rel="enclosure"`` / etc.
    * RSS 2.0: ``<link>https://...</link>`` — bare text content.

    Returns "" if nothing usable is present; the agent surfaces that
    gap in its summary rather than the tool raising.
    """
    for link in entry.findall("link"):
        href = link.attrib.get("href")
        if href:
            rel = link.attrib.get("rel", "alternate")
            if rel in {"alternate", ""}:
                return href
        elif link.text:
            return link.text.strip()
    return ""


def _entry_summary(entry: ET.Element) -> str:
    """Short item description.

    Many RSS feeds stuff HTML into ``<description>`` (paragraphs,
    links, even inline images). The LLM can read HTML but it's noisy
    context — we run ``html_to_text`` unconditionally. Atom uses
    ``<summary>`` (sometimes with ``type="html"``); same treatment.
    """
    raw = _text_of(entry, "summary") or _text_of(entry, "description") or ""
    return html_to_text(raw) if raw else ""


def _entry_published(entry: ET.Element) -> str:
    """Published timestamp — we pass the raw string through.

    RFC 2822 in RSS, ISO-8601 in Atom, mangled in half the world's
    feeds. The LLM does a fine job interpreting either format, so
    normalising into ``datetime`` would cost code + risk without
    improving downstream reasoning.
    """
    return (
        _text_of(entry, "pubDate")
        or _text_of(entry, "published")
        or _text_of(entry, "updated")
        or ""
    )


def _parse_feed(xml_bytes: bytes, url: str, limit: int) -> dict[str, Any]:
    """Parse an RSS/Atom payload into the tool's output shape.

    Raises ``ValueError`` for un-parseable XML so the caller can convert
    it into a friendly tool_result error instead of a traceback.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ValueError(f"feed parse error: {exc}") from exc

    _strip_namespaces(root)

    items: list[dict[str, str]] = []
    for entry in root.iter():
        if entry.tag in {"item", "entry"}:
            items.append({
                "title":     _text_of(entry, "title") or "",
                "link":      _entry_link(entry),
                "summary":   _entry_summary(entry),
                "published": _entry_published(entry),
            })
            if len(items) >= limit:
                break

    return {
        "url":   url,
        "title": _feed_title(root),
        "items": items,
    }


# ─────────────────────────────────────────────────────────────
# rss_fetch
# ─────────────────────────────────────────────────────────────
class RssFetchInput(BaseModel):
    url:   HttpUrl = Field(..., description="Public http(s) RSS or Atom feed URL.")
    limit: int     = Field(
        default=10, ge=1, le=50,
        description="Max items to return; agents usually want 5-15.",
    )


class RssItem(BaseModel):
    title:     str
    link:      str
    summary:   str
    published: str


class RssFetchOutput(BaseModel):
    url:   str
    title: str
    items: list[RssItem]


class RssFetchTool(Tool):
    name          = "rss_fetch"
    description   = (
        "Fetch a public RSS 2.0 or Atom feed and return up to `limit` "
        "items as {title, link, summary, published}. Private/loopback "
        "hosts are refused. HTML inside item descriptions is stripped "
        "to plain text. The raw published timestamp is passed through "
        "so the LLM can decide how to interpret it."
    )
    input_schema  = RssFetchInput
    output_schema = RssFetchOutput

    timeout_seconds: float = 10.0

    async def run(self, payload: RssFetchInput, ctx: ToolContext) -> dict[str, Any]:
        url = str(payload.url)
        guard_url(url)

        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            follow_redirects=True,
            max_redirects=3,
        ) as http:
            res = await http.get(url)
        res.raise_for_status()

        # Use ``res.content`` (bytes) — ElementTree prefers raw bytes so
        # it can honour the XML declaration's encoding. ``res.text``
        # forces httpx to decode via charset guess, which occasionally
        # disagrees with the declaration and produces mojibake in the
        # parsed titles.
        return _parse_feed(res.content, str(res.url), payload.limit)
