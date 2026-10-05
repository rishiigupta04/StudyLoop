"""Minimal JSON-mode chat client for the data scripts (paraphrase.py, verify_paraphrases.py).

Only these two scripts talk to an LLM, and their outputs are committed (data/paraphrases.jsonl,
data/paraphrase_checks.jsonl), so rebuilding the dataset or retraining never needs a key.
Keys are read from the environment or backend/.env and never printed.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass

import httpx

from common import BACKEND

PROVIDERS = {
    # the generator: a Groq model the app itself never calls, so its per-model rate limit is ours alone
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    # the judge: a different model family, so it doesn't share the generator's blind spots
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY"),
}
# the live app's Groq models (answers + router): bulk data work must never eat their daily quota
LIVE_MODELS = ("openai/gpt-oss-120b", "openai/gpt-oss-20b")


class QuotaExhausted(RuntimeError):
    """The model's daily bucket is empty. Both providers refill it continuously (Groq qwen: 200K tokens/day ≈
    139/min; Gemini free tier: 20 requests/day ≈ one per 72 min), so `retry_after` says when to try again."""

    def __init__(self, message: str, retry_after: float = 4320.0) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class Overloaded(RuntimeError):
    """Gemini's 503 "high demand". On the free tier every such attempt still costs one of the day's 20 requests
    (28 Sep 2026: 3.8 Flash's whole day went on retries), so callers try another model instead of hammering."""


def chat_for(model: str, otpm: int = 0, allow_live: bool = False) -> Chat:
    """'qwen/qwen3.8-27b' → Groq; 'gemini-…' / 'gemma-…' → Gemini's native endpoint (it takes a seed)."""
    if model in LIVE_MODELS and not allow_live:
        raise SystemExit(f"{model} is the live app's quota: not for bulk data work")
    if model.startswith(("gemini", "gemma")):
        return Chat("gemini", model)
    extra = {"reasoning_effort": "none"} if model.startswith("qwen/") else {"reasoning_effort": "low"}
    return Chat("groq", model, extra, otpm=otpm)


def _key(name: str) -> str:
    if os.environ.get(name):
        return os.environ[name]
    env = BACKEND / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(rf"\s*{name}\s*=\s*(.*)\s*$", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise SystemExit(f"{name} is not set (env or backend/.env)")


@dataclass
class Chat:
    provider: str
    model: str
    extra: dict | None = None  # e.g. {"reasoning_effort": "none"}
    min_interval_s: float = 0.0  # crude pacing on top of the rate-limit headers
    # output tokens per minute the provider allows (Groq: 1,000 for qwen3.8-27b on this key): after each answer,
    # wait until that answer's share of the minute has passed, so the next request never meets a 429
    otpm: int = 0
    # Groq's tokens-per-day bucket refills continuously (200K/day ≈ 139 tokens/min for qwen3.8-27b), so a TPD 429
    # says exactly how long to wait: wait up to this long, else give up on the batch (a rerun resumes it)
    max_wait_s: float = 90.0
    # Gemini answers 503 "high demand" for long stretches (US daytime) and every attempt costs quota: after this
    # many overloaded attempts, raise Overloaded and let the caller move on
    overload_retries: int = 2

    def __post_init__(self) -> None:
        base, key_name = PROVIDERS[self.provider]
        self._url = f"{base}/chat/completions"
        self._headers = {"Authorization": f"Bearer {_key(key_name)}"}
        self._client = httpx.Client(timeout=300)  # a thinking model writing 160 paraphrases can take minutes
        self._last = 0.0
        self.usage = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0}

    def json(
        self,
        prompt: str,
        *,
        temperature: float,
        seed: int | None = None,
        retries: int = 10,
        max_tokens: int = 0,
    ) -> dict:
        if self.provider == "gemini":
            return self._gemini_native(prompt, temperature=temperature, seed=seed, retries=retries)
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            **(self.extra or {}),
        }
        if (
            max_tokens
        ):  # Groq's per-minute output cap is checked against what a request MAY produce: ask small
            body["max_tokens"] = max_tokens
        if seed is not None:
            body["seed"] = seed
        for attempt in range(retries):
            wait = self.min_interval_s - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self._client.post(self._url, headers=self._headers, json=body)
            except httpx.HTTPError as exc:
                time.sleep(2 + 3 * attempt)
                last = str(exc)
                continue
            if r.status_code == 429 or r.status_code >= 500:
                retry_after = _seconds(r.headers.get("retry-after")) or 5 + 10 * attempt
                per_day = "per day" in r.text.lower()
                cap = self.max_wait_s if per_day else 90
                if per_day and retry_after > cap:
                    raise QuotaExhausted(
                        f"{self.model}: daily tokens spent, {retry_after:.0f}s to refill", retry_after
                    )
                print(
                    f"  {self.model}: {r.status_code}, retrying in {min(retry_after, cap):.0f}s: {r.text[140:420]}",
                    file=sys.stderr,
                    flush=True,
                )
                time.sleep(min(retry_after, cap))
                last = f"{r.status_code} {r.text[:200]}"
                continue
            if r.status_code != 200:
                raise RuntimeError(f"{self.provider} {r.status_code}: {r.text[:300]}")
            j = r.json()
            u = j.get("usage") or {}
            self.usage["requests"] += 1
            self.usage["prompt_tokens"] += u.get("prompt_tokens", 0)
            self.usage["completion_tokens"] += u.get("completion_tokens", 0)
            self._pace(r.headers)
            if self.otpm:
                share = 60.0 * u.get("completion_tokens", 0) / self.otpm
                time.sleep(max(0.0, share - (time.monotonic() - self._last)))
            content = j["choices"][0]["message"].get("content") or ""
            try:
                return json.loads(_strip_fence(content))
            except json.JSONDecodeError:
                last = f"bad JSON: {content[:200]}"
                continue
        raise RuntimeError(f"{self.provider}/{self.model} failed after {retries} tries: {last}")

    def _gemini_native(self, prompt: str, *, temperature: float, seed: int | None, retries: int) -> dict:
        """Gemini's native endpoint: unlike its OpenAI-compatible one, it accepts a sampling seed."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        config: dict = {"temperature": temperature, "responseMimeType": "application/json"}
        if seed is not None:
            config["seed"] = seed
        level = (self.extra or {}).get("reasoning_effort")
        if level:
            config["thinkingConfig"] = {"thinkingLevel": level}
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": config}
        headers = {"x-goog-api-key": self._headers["Authorization"].removeprefix("Bearer ")}
        last = ""
        overloaded = 0
        for attempt in range(retries):
            wait = self.min_interval_s - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                r = self._client.post(url, headers=headers, json=body)
            except httpx.HTTPError as exc:
                print(f"  {self.model}: {type(exc).__name__}, retrying", file=sys.stderr, flush=True)
                time.sleep(2 + 3 * attempt)
                last = str(exc)
                continue
            if r.status_code == 429 and "PerDay" in r.text:  # the free tier's requests/day bucket is empty
                delay = re.search(r'"retryDelay":\s*"([\d.]+)s"', r.text)
                raise QuotaExhausted(
                    f"gemini/{self.model}: daily requests spent", float(delay.group(1)) if delay else 4320.0
                )
            if r.status_code >= 500:
                overloaded += 1
                print(f"  {self.model}: {r.status_code} ({overloaded})", file=sys.stderr, flush=True)
                if overloaded >= self.overload_retries:
                    raise Overloaded(f"gemini/{self.model}: {r.status_code} after {overloaded} attempts")
                time.sleep(20)
                last = f"{r.status_code} {r.text[:200]}"
                continue
            if r.status_code == 429:  # per-minute limits: brief
                print(f"  {self.model}: 429, retry {attempt + 1}", file=sys.stderr, flush=True)
                time.sleep(min(_seconds(r.headers.get("retry-after")) or 10 + 15 * attempt, 90))
                last = f"{r.status_code} {r.text[:200]}"
                continue
            if r.status_code != 200:
                raise RuntimeError(f"gemini {r.status_code}: {r.text[:300]}")
            j = r.json()
            u = j.get("usageMetadata") or {}
            self.usage["requests"] += 1
            self.usage["prompt_tokens"] += u.get("promptTokenCount", 0)
            self.usage["completion_tokens"] += u.get("candidatesTokenCount", 0)
            parts = ((j.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            content = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            try:
                return json.loads(_strip_fence(content))
            except json.JSONDecodeError:
                last = f"bad JSON: {content[:200]}"
                continue
        raise RuntimeError(f"gemini/{self.model} failed after {retries} tries: {last}")

    def _pace(self, headers: httpx.Headers) -> None:
        """Groq sends token budgets; sleep until the window refills rather than eat a 429."""
        remaining = headers.get("x-ratelimit-remaining-tokens")
        if remaining is not None and int(remaining) < 2500:
            time.sleep((_seconds(headers.get("x-ratelimit-reset-tokens")) or 10) + 0.5)


def _seconds(value: str | None) -> float | None:
    """'7.66s' / '1m26.4s' / '12' → seconds."""
    if not value:
        return None
    m = re.fullmatch(r"(?:(\d+)m)?(?:([\d.]+)s?)?", value.strip())
    if not m or not any(m.groups()):
        return None
    return float(m.group(1) or 0) * 60 + float(m.group(2) or 0)


def _strip_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s)
    return s
