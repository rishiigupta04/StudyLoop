"""Drive voice turns over /ws/session and report what the server did and how long it took (server-side timings).

    backend/.venv/Scripts/python ml/probe_ws.py                                  # backend-1a on :8001
    backend/.venv/Scripts/python ml/probe_ws.py --url wss://studyloop-api-58vj.onrender.com --token <jwt>
    backend/.venv/Scripts/python ml/probe_ws.py --audio                          # real speech: /api/tts → /api/stt

Text goes over the socket as JSON built by Python (Git Bash curl mangles Devanagari). With --audio every command is
first spoken by the server's own TTS (Sarvam Bulbul), then transcribed by its own STT (/api/stt, the provider the
server prefers) and that transcript is what's sent — the path a push-to-talk turn takes, minus the microphone.
--repeat N sends the set N times for a p95. Against Render this is how "fast path < 150 ms on the Render instance"
gets measured: the `timings` in each reply are the server's own per-node milliseconds.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid

import httpx
import websockets

COMMANDS = [
    ("en", "go back 10 seconds"),
    ("en", "pause the video"),
    ("en", "take me to where he explains binary search"),
    ("en", "what did he just say about the peak"),
    ("en", "set the speed to 1.5"),
    ("hinglish", "thoda peeche le jao"),
    ("hinglish", "das second aage karo"),
    ("hinglish", "awaaz thodi badha do"),
    ("hinglish", "phir se bolo zara"),
    ("hi", "वीडियो को pause कर दो"),
    ("hi", "30 सेकंड पीछे जाओ"),
    ("hi", "speed 1.25 कर दीजिए"),
    ("hi", "जहाँ उसने 2D peak समझाया वहाँ ले चलो"),
    ("hi", "अब तक का सारांश बताइए"),
]
FAST = ("normalize_input", "classify_intent", "parse_slots", "action_executor")


async def speech_roundtrip(
    http: httpx.AsyncClient, base: str, token: str | None, text: str, style: str
) -> dict:
    """The server speaks the command (TTS), then transcribes that audio (STT): real audio, no microphone."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    lang = "hi" if style != "en" else "en"
    tts = await http.post(f"{base}/api/tts", json={"text": text, "language": lang}, headers=headers)
    tts.raise_for_status()
    audio, ctype = tts.content, tts.headers.get("content-type", "audio/mpeg").split(";")[0]
    t0 = time.perf_counter()
    stt = await http.post(
        f"{base}/api/stt",
        files={"file": ("speech.mp3", audio, ctype)},
        data={"language": lang},
        headers=headers,
    )
    stt.raise_for_status()
    body = stt.json()
    return {
        "text": body.get("text", ""),
        "provider": body.get("provider"),
        "stt_ms": (time.perf_counter() - t0) * 1000,
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://127.0.0.1:8001")
    ap.add_argument("--token")
    ap.add_argument("--video", default="HtSuA80QTyo")
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--audio", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()
    http_base = args.url.replace("ws://", "http://").replace("wss://", "https://")

    async with httpx.AsyncClient(timeout=60) as http:
        health = (await http.get(f"{http_base}/health")).json()
        print(f"/health: classifier={health.get('classifier')!r} model={health.get('classifier_model')!r}")
        spoken = {}
        if args.audio:
            for style, text in COMMANDS:
                spoken[text] = await speech_roundtrip(http, http_base, args.token, text, style)
                print(f"  spoken → {spoken[text]['provider']}: {text!r} → {spoken[text]['text']!r}")

    results = []
    async with websockets.connect(f"{args.url}/ws/session", max_size=2**22) as ws:
        hello = {"type": "hello", "video_id": args.video, "session_id": str(uuid.uuid4()), "language": "en"}
        if args.token:
            hello["token"] = args.token
        await ws.send(json.dumps(hello))
        ready = None
        while ready is None:
            msg = json.loads(await ws.recv())
            if msg["type"] == "ready":
                ready = msg
        print(f"ready: classifier={ready['classifier']!r}")
        # seek / ask / summarize need the transcript: wait for ingestion to report it (a cached video is instant)
        status = None
        try:
            while status not in ("ready", "unavailable", "failed"):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if msg["type"] == "video.status":
                    status = msg.get("status")
        except TimeoutError:
            pass
        print(f"video.status: {status!r}")
        for _ in range(args.repeat):
            for style, text in COMMANDS:
                said = spoken.get(text, {}).get("text", text) if args.audio else text
                turn = str(uuid.uuid4())
                lang = "hi" if style == "hi" else "en"
                await ws.send(
                    json.dumps(
                        {
                            "type": "utterance",
                            "turn_id": turn,
                            "text": said,
                            "playback_s": 1500.0,
                            "max_watched_s": 3000.0,
                            "language": lang,
                        },
                        ensure_ascii=False,
                    )
                )
                t0 = time.perf_counter()
                while True:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
                    if msg.get("turn_id") == turn and msg["type"] in ("action", "answer.done", "error"):
                        break
                rtt = (time.perf_counter() - t0) * 1000
                timings = msg.get("timings") or {}
                results.append(
                    {
                        "style": style,
                        "sent": said,
                        "intent": msg.get("intent"),
                        "confidence": msg.get("confidence"),
                        "route": msg.get("route"),
                        "action": msg.get("action"),
                        "reply": msg.get("message") or msg.get("text"),
                        "classify_ms": timings.get("classify_intent"),
                        "fast_ms": sum(timings.get(k, 0.0) for k in FAST)
                        if msg.get("route") == "fast"
                        else None,
                        "rtt_ms": rtt,
                    }
                )
    print(
        "\n| style | sent | intent (conf) | route | action / reply | classify ms | fast path ms | round trip ms |"
    )
    print("|---|---|---|---|---|---:|---:|---:|")
    for r in results[: len(COMMANDS)]:
        conf = f"{r['confidence']:.2f}" if isinstance(r["confidence"], int | float) else "–"
        what = json.dumps(r["action"], ensure_ascii=False) if r["action"] else (r["reply"] or "")[:70]
        fast = f"{r['fast_ms']:.1f}" if r["fast_ms"] is not None else "–"
        cls = f"{r['classify_ms']:.1f}" if r["classify_ms"] is not None else "–"
        print(
            f"| {r['style']} | {r['sent']} | {r['intent']} ({conf}) | {r['route']} | {what} | {cls} | {fast} | {r['rtt_ms']:.0f} |"
        )
    cls = sorted(r["classify_ms"] for r in results if r["classify_ms"] is not None)
    fast = sorted(r["fast_ms"] for r in results if r["fast_ms"] is not None)
    if cls:
        print(
            f"\nclassify_intent: n={len(cls)} p50 {cls[len(cls) // 2]:.1f} ms  p95 {cls[int(len(cls) * 0.95)]:.1f} ms"
        )
    if fast:
        print(
            f"fast path (server): n={len(fast)} p50 {fast[len(fast) // 2]:.1f} ms  p95 {fast[int(len(fast) * 0.95)]:.1f} ms"
        )
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(
                {"health": health, "results": results, "spoken": spoken}, f, ensure_ascii=False, indent=2
            )


if __name__ == "__main__":
    asyncio.run(main())
