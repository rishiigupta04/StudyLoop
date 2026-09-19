"""One pooled `httpx.AsyncClient` per event loop.

Query-time calls (embedding a question, streaming an answer) are on the user's critical path; a fresh
client per call pays a TLS handshake (~100–200 ms) every time. A client is bound to the loop that first
used it, so the cache is keyed by loop (tests run several loops in one process).
"""

from __future__ import annotations

import asyncio
import weakref

import httpx

_clients: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, httpx.AsyncClient] = (
    weakref.WeakKeyDictionary()
)


def shared_client() -> httpx.AsyncClient:
    loop = asyncio.get_running_loop()
    client = _clients.get(loop)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(timeout=30.0, limits=httpx.Limits(max_keepalive_connections=10))
        _clients[loop] = client
    return client
