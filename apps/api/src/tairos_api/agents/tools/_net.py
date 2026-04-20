"""Shared networking helpers for web-facing tools.

Right now: a single SSRF guard (``guard_url``) used by both
``web_fetch`` and ``rss_fetch``. Extracted into its own module because
the policy is identical and duplicating it tends to drift — if we
later tighten the rules (e.g. also block known cloud-metadata domains
like ``169.254.169.254``, which is already caught by the link-local
check but could have company-specific additions), one file changes.

Design notes
~~~~~~~~~~~~
* **DNS-resolve before connect**: ``socket.getaddrinfo`` runs *before*
  ``httpx.AsyncClient.get`` opens a socket. A hostile host that
  resolves to ``127.0.0.1`` still reaches the guard first.
* **Every returned address is checked**: an attacker could register a
  domain with one public A-record and one private AAAA record; we walk
  the full ``getaddrinfo`` response and reject on the first bad IP.
* **DNS rebinding is an acceptable gap**: a second resolution at
  connect time could return a different IP than the one we checked.
  Closing that requires either (a) binding httpx to the resolved IP
  (brittle with SNI) or (b) a custom resolver. Neither is worth the
  complexity for a local single-operator dev tool — documented rather
  than silently ignored.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


def guard_url(url: str) -> None:
    """Raise ``ValueError`` if ``url`` points at a non-public destination.

    Refuses:
      * non-http(s) schemes (``file://``, ``gopher://``, ``ftp://``, ...)
      * hosts that resolve to any private / loopback / link-local /
        multicast / reserved / unspecified IP (v4 or v6)
      * hosts that don't resolve at all — failing noisily beats the
        alternative of letting httpx hang for seconds on DNS errors
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"refused scheme: {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise ValueError("URL has no host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise ValueError(f"cannot resolve host {host!r}: {exc}") from exc
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(f"refused private/loopback address: {ip_str}")
