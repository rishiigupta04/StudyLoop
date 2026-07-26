# TranscriptAPI — Developer Reference

> **Integration Service**: StudyLoop uses TranscriptAPI to extract timestamped YouTube transcripts for RAG ingestion, Hindi/Hinglish priority fetching, and transcript display.
> **Official Docs**: https://transcriptapi.com
> **Service File**: [`src/services/transcriptService.ts`](file:///d:/StudyLoop%20Web/StudyLoop%20Web/src/services/transcriptService.ts)

---

## Base URL

```
https://transcriptapi.com/api/v2
```

---

## Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

**Store your key as:**
```
VITE_TRANSCRIPT_API_KEY=your-key-here     ← frontend (read-only fetching, Phase 1)
TRANSCRIPT_API_KEY=your-key-here          ← backend FastAPI (Phase 4+, secure)
```

> [!WARNING]
> The official docs advise **never exposing API keys in client-side code**. In Phase 1 (frontend-only), the key is used via `import.meta.env.VITE_TRANSCRIPT_API_KEY` with a graceful mock fallback when absent. From Phase 4 onwards, all TranscriptAPI calls move to the FastAPI backend and the `VITE_` version should be removed.

---

## Endpoints Reference

| Endpoint | Credits | Description |
| :--- | :---: | :--- |
| `GET /youtube/transcript` | 1 | Extract transcript (with language priority list) |
| `GET /youtube/info` | **Free** | Video metadata + available caption language codes |
| `GET /youtube/search` | 1 | Search YouTube videos or channels |
| `GET /youtube/channel/resolve` | **Free** | Resolve `@handle` or URL to channel ID |
| `GET /youtube/channel/search` | 1 | Search within a channel |
| `GET /youtube/channel/videos` | 1/page | Paginated channel uploads |
| `GET /youtube/channel/latest` | **Free** | Latest 15 videos via RSS |
| `GET /youtube/playlist/videos` | 1/page | Paginated playlist videos |

---

## `GET /youtube/info` — Free Metadata Check

Call this **before** `/youtube/transcript` to check what languages are available without spending a credit.

### Request

```bash
curl -X GET "https://transcriptapi.com/api/v2/youtube/info?video_url=dQw4w9WgXcQ" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Accepted `video_url` formats

| Format | Example |
| :--- | :--- |
| Full URL | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| Short URL | `https://youtu.be/dQw4w9WgXcQ` |
| Video ID only | `dQw4w9WgXcQ` |

### Response

```json
{
  "video_id": "dQw4w9WgXcQ",
  "metadata": {
    "title": "MIT 6.006 Introduction to Algorithms",
    "author_name": "MIT OpenCourseWare",
    "author_url": "https://www.youtube.com/@mitocw",
    "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  },
  "available_languages": [
    { "code": "en",     "name": "English" },
    { "code": "asr-en", "name": "English (auto-generated)" },
    { "code": "hi",     "name": "Hindi" },
    { "code": "asr-hi", "name": "Hindi (auto-generated)" }
  ]
}
```

**Returns `404`** when the video has no captions or does not exist.

---

## `GET /youtube/transcript` — Transcript Extraction (1 Credit)

### StudyLoop Integration Call

StudyLoop always requests with a language priority list that prefers Hindi/Hinglish tracks:

```bash
curl -X GET "https://transcriptapi.com/api/v2/youtube/transcript
  ?video_url=dQw4w9WgXcQ
  &language=hi,asr-hi,en,asr-en
  &send_metadata=true
  &include_timestamp=true
  &format=json" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :--- | :--- |
| `video_url` | `string` | ✅ | — | YouTube URL or 11-char video ID |
| `language` | `string` | ❌ | English | Comma-separated language priority list (up to 10 codes) |
| `format` | `string` | ❌ | `json` | `json` or `text` |
| `include_timestamp` | `boolean` | ❌ | `true` | Include `start` and `duration` per segment |
| `send_metadata` | `boolean` | ❌ | `false` | Include video title, author, channel URL, thumbnail |

### Language Code Reference

| Code | Meaning |
| :--- | :--- |
| `hi` | Hindi — creator-uploaded captions first, then falls back to `asr-hi` |
| `asr-hi` | Hindi auto-generated captions only |
| `en` | English — creator-uploaded captions first, then falls back to `asr-en` |
| `asr-en` | English auto-generated captions only |
| `asr` | Any auto-generated track (useful for language detection) |

**Priority logic**: Codes are tried left-to-right. The first available language wins. If none resolve, you receive a `404` listing what tracks the video _does_ have.

**Language detection tip**: If the response `language` comes back as `asr-hi`, it means the video is in Hindi and uses auto-generated captions.

### Response — JSON with Timestamps (StudyLoop Default)

```json
{
  "video_id": "dQw4w9WgXcQ",
  "language": "asr-hi",
  "transcript": [
    {
      "text": "नमस्ते, आज हम algorithms के बारे में बात करेंगे",
      "start": 0.0,
      "duration": 4.12
    },
    {
      "text": "Peak finding problem को समझते हैं",
      "start": 4.12,
      "duration": 3.85
    }
  ],
  "metadata": {
    "title": "MIT 6.006 Lecture 1 — Algorithms",
    "author_name": "MIT OpenCourseWare",
    "author_url": "https://www.youtube.com/@mitocw",
    "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  },
  "length_seconds": 4800,
  "lengthText": "1:20:00"
}
```

### Behaviour Matrix

| `format` | `include_timestamp` | Output |
| :---: | :---: | :--- |
| `json` | `true` | Segments with `text`, `start`, `duration` *(StudyLoop default)* |
| `json` | `false` | Segments with `text` only |
| `text` | `true` | Lines as `[123.45s] text` |
| `text` | `false` | Plain concatenated text |

### Response Headers

| Header | Values | Description |
| :--- | :--- | :--- |
| `X-Cache-Status` | `HIT`, `PARTIAL-HIT`, `MISS` | Whether TranscriptAPI served from its own cache |

### Error Responses

| HTTP | Scenario |
| :---: | :--- |
| `404` | Video not found, no captions, or none of the requested languages are available. Body lists available language codes. |
| `401` | Invalid or missing API key |
| `429` | Rate limit exceeded |

---

## Credit Budget

| Plan Allocation | Credits |
| :--- | :--- |
| Current Pool | **100 credits** |
| Transcript Fetch | 1 credit per video |
| Info Fetch | **Free** |

> [!TIP]
> Always call `GET /youtube/info` first (free) to confirm transcript availability before spending a transcript credit. Redis caching (Phase 4) eliminates re-fetching the same video's transcript.

---

## StudyLoop Integration Patterns

### Pattern 1: Language-Aware Fetch (used in `transcriptService.ts`)

```typescript
// Priority: Hindi creator captions → Hindi ASR → English creator → English ASR
const LANGUAGE_PRIORITY = 'hi,asr-hi,en,asr-en';

const url = new URL('https://transcriptapi.com/api/v2/youtube/transcript');
url.searchParams.set('video_url', videoId);
url.searchParams.set('language', LANGUAGE_PRIORITY);
url.searchParams.set('send_metadata', 'true');
url.searchParams.set('include_timestamp', 'true');
url.searchParams.set('format', 'json');

const res = await fetch(url.toString(), {
  headers: { Authorization: `Bearer ${apiKey}` }
});
```

### Pattern 2: Hindi Detection

```typescript
const data = await res.json();
const isHindi = data.language?.startsWith('hi') || data.language === 'asr-hi';
// If isHindi → display Devanagari, route TTS to MeloTTS Hindi checkpoint
```

### Pattern 3: Timestamp Formatting

```typescript
function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
```

### Pattern 4: Phase 4 Redis Cache-Aside

```python
# Python / FastAPI (Phase 4)
async def get_transcript(video_id: str) -> dict:
    cache_key = f"transcript:{video_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    transcript = await fetch_transcript_api(video_id)
    await redis.setex(cache_key, 604800, json.dumps(transcript))  # 7-day TTL
    return transcript
```

---

## Future Endpoints (Phase 5+)

| Endpoint | Use Case |
| :--- | :--- |
| `GET /youtube/search` | "Search for videos about recursion" voice command |
| `GET /youtube/channel/videos` | Playlist & course mode (Horizon 1 roadmap) |
| `GET /youtube/playlist/videos` | Cross-video RAG spanning entire course playlist |
