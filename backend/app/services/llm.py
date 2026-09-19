"""LLM access (roadmap D3/D5/D8): Groq primary, Gemini fallback, both via their OpenAI-compatible APIs.

- `stream()` streams an answer token by token (→ `answer.delta`), and stops early if the turn was
  cancelled (barge-in).
- `tools()` is the single tool-calling request behind `llm_router`.
Retries a provider once with backoff on 429 / 5xx / network errors, then moves to the next provider.
A provider that fails *after* it has streamed text isn't swapped out mid-answer: the partial answer
stands and the error is raised.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings
from app.services.http import shared_client

log = logging.getLogger("studyloop.llm")

RETRY_STATUS = {429, 500, 502, 503, 504}

OnDelta = Callable[[str], Awaitable[None]]
IsCancelled = Callable[[], bool]


class LLMError(RuntimeError):
    pass


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    router_model: str
    extra: tuple[tuple[str, Any], ...] = ()  # provider-specific request fields

    def params(self, model: str, max_tokens: int) -> dict[str, Any]:
        """Reasoning models (gpt-oss, Gemini 3) spend hidden tokens thinking before the answer: give them
        headroom so a short answer budget can't end up as an empty or cut-off reply."""
        if "gpt-oss" in model or model.startswith("gemini-3"):
            return {**dict(self.extra), "max_tokens": max_tokens + 768}
        return {"max_tokens": max_tokens}


def providers_from(settings: Settings) -> list[Provider]:
    out: list[Provider] = []
    if settings.groq_api_key:
        out.append(
            Provider(
                "groq",
                "https://api.groq.com/openai/v1",
                settings.groq_api_key,
                settings.groq_model,
                settings.groq_router_model or settings.groq_model,
                (("reasoning_effort", settings.groq_reasoning_effort),)
                if settings.groq_reasoning_effort
                else (),
            )
        )
    if settings.gemini_api_key:
        out.append(
            Provider(
                "gemini",
                "https://generativelanguage.googleapis.com/v1beta/openai",
                settings.gemini_api_key,
                settings.gemini_model,
                settings.gemini_model,
                (("reasoning_effort", settings.gemini_reasoning_effort),)
                if settings.gemini_reasoning_effort
                else (),
            )
        )
    return out


class LLMClient:
    def __init__(
        self, providers: list[Provider], *, timeout_s: float = 30.0, http: httpx.AsyncClient | None = None
    ):
        self.providers = providers
        self._timeout = timeout_s
        self._http = http

    @property
    def configured(self) -> bool:
        return bool(self.providers)

    def _client(self) -> httpx.AsyncClient:
        return self._http or shared_client()

    @staticmethod
    def _headers(p: Provider) -> dict[str, str]:
        return {"Authorization": f"Bearer {p.api_key}", "Content-Type": "application/json"}

    @staticmethod
    async def _backoff(resp: httpx.Response | None, attempt: int) -> None:
        wait = 0.5 * 2**attempt
        if resp is not None:
            try:
                wait = max(wait, float(resp.headers.get("retry-after", 0)))
            except ValueError:
                pass
        await asyncio.sleep(min(wait, 4.0))

    # ------------------------------------------------------------------ streaming answers
    async def stream(
        self,
        messages: list[dict[str, Any]],
        *,
        on_delta: OnDelta | None = None,
        is_cancelled: IsCancelled | None = None,
        max_tokens: int = 400,
        temperature: float = 0.3,
        fast: bool = False,
    ) -> str:
        """`fast` = the provider's small model (the router's), for bulk background work."""
        errors: list[str] = []
        for p in self.providers:
            model = p.router_model if fast else p.model
            for attempt in range(2):
                parts: list[str] = []
                resp: httpx.Response | None = None
                try:
                    body = {
                        "model": model,
                        "messages": messages,
                        "stream": True,
                        "temperature": temperature,
                        **p.params(model, max_tokens),
                    }
                    async with self._client().stream(
                        "POST",
                        f"{p.base_url}/chat/completions",
                        json=body,
                        headers=self._headers(p),
                        timeout=self._timeout,
                    ) as resp:
                        if resp.status_code != 200:
                            text = (await resp.aread()).decode(errors="replace")[:300]
                            raise LLMError(f"{p.name} HTTP {resp.status_code}: {text}")
                        async for line in resp.aiter_lines():
                            if is_cancelled and is_cancelled():
                                log.info("%s stream cancelled by the client", p.name)
                                return "".join(parts)
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                            except ValueError:
                                continue
                            choices = chunk.get("choices") or [{}]
                            delta = (choices[0].get("delta") or {}).get("content")
                            if delta:
                                parts.append(delta)
                                if on_delta:
                                    await on_delta(delta)
                    return "".join(parts)
                except (httpx.HTTPError, LLMError) as exc:
                    errors.append(str(exc) or type(exc).__name__)
                    log.warning("%s stream failed (attempt %d): %s", p.name, attempt + 1, errors[-1])
                    if parts:  # already spoke part of the answer — don't restart it with another model
                        raise LLMError("; ".join(errors)) from exc
                    status = resp.status_code if resp is not None else None
                    if status is not None and status not in RETRY_STATUS:
                        break  # auth/bad request: this provider won't recover, try the next one
                    if attempt == 0:
                        await self._backoff(resp, attempt)
        raise LLMError("; ".join(errors) or "no LLM provider configured")

    # ------------------------------------------------------------------ one tool-calling request (router)
    async def tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        max_tokens: int = 200,
    ) -> dict[str, Any]:
        """Returns the assistant message: {"content": str|None, "tool_calls": [...]}."""
        errors: list[str] = []
        for p in self.providers:
            for attempt in range(2):
                resp: httpx.Response | None = None
                try:
                    resp = await self._client().post(
                        f"{p.base_url}/chat/completions",
                        json={
                            "model": p.router_model,
                            "messages": messages,
                            "tools": tools,
                            "tool_choice": "auto",
                            "temperature": 0,
                            **p.params(p.router_model, max_tokens),
                        },
                        headers=self._headers(p),
                        timeout=self._timeout,
                    )
                    if resp.status_code == 200:
                        return resp.json()["choices"][0]["message"]
                    raise LLMError(f"{p.name} HTTP {resp.status_code}: {resp.text[:300]}")
                except (httpx.HTTPError, LLMError, KeyError, IndexError, ValueError) as exc:
                    errors.append(str(exc) or type(exc).__name__)
                    log.warning("%s tool call failed (attempt %d): %s", p.name, attempt + 1, errors[-1])
                    status = resp.status_code if resp is not None else None
                    if status is not None and status != 200 and status not in RETRY_STATUS:
                        break
                    if attempt == 0:
                        await self._backoff(resp, attempt)
        raise LLMError("; ".join(errors) or "no LLM provider configured")


_llm: LLMClient | None = None


def get_llm(settings: Settings | None = None) -> LLMClient:
    global _llm
    if _llm is None:
        from app.config import get_settings

        s = settings or get_settings()
        _llm = LLMClient(providers_from(s), timeout_s=s.llm_timeout_s)
    return _llm


def set_llm(client: LLMClient | None) -> None:
    global _llm
    _llm = client
