# STUDYLOOP — API Contract Reference

> Complete REST and WebSocket API specification for frontend ↔ backend communication.
> This document serves as the contract between the React frontend and the FastAPI backend.

---

## Base URL

| Environment | REST | WebSocket |
| :--- | :--- | :--- |
| Local Dev | `http://localhost:8000/api` | `ws://localhost:8000/ws` |
| Production | `https://api.studyloop.ai/api` | `wss://api.studyloop.ai/ws` |

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer {supabase_access_token}
```

The token is obtained from Supabase Auth (`supabase.auth.getSession()`).

---

## REST Endpoints

### Auth

#### `POST /api/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "student@studyloop.ai",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "user": { "id": "uuid", "email": "...", "full_name": "..." },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

#### `POST /api/auth/register`
Create a new account.

**Request:**
```json
{
  "email": "student@studyloop.ai",
  "password": "password123",
  "full_name": "Arjun Sharma"
}
```

#### `GET /api/auth/me` 🔒
Get the current user's profile.

**Response (200):**
```json
{
  "id": "uuid",
  "email": "student@studyloop.ai",
  "full_name": "Arjun Sharma",
  "preferred_language": "EN"
}
```

---

### Videos

#### `POST /api/videos/process` 🔒
Submit a YouTube video URL for transcript ingestion and embedding generation.

**Request:**
```json
{
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Response (202 Accepted):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "status": "processing",
  "message": "Transcript ingestion started"
}
```

**Response (200 — cached):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "status": "ready",
  "transcript_segments": 47,
  "embedding_chunks": 23
}
```

#### `GET /api/videos/{video_id}/transcript` 🔒
Get the cached transcript for a video.

**Response (200):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "language": "en",
  "transcript": [
    { "text": "Welcome to...", "start": 0.0, "duration": 4.12 }
  ],
  "metadata": {
    "title": "...",
    "author_name": "...",
    "thumbnail_url": "..."
  },
  "length_seconds": 4800
}
```

#### `GET /api/videos/{video_id}/chapters` 🔒
Get auto-generated chapter boundaries.

**Response (200):**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "chapters": [
    { "title": "Introduction", "start": 0, "end": 272 },
    { "title": "Peak Finding", "start": 272, "end": 735 }
  ]
}
```

---

### Q&A

#### `POST /api/qa/ask` 🔒
Submit a text-based question (non-voice path).

**Request:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "question": "What did the professor say about recursion?",
  "current_player_time": 1450.0,
  "language": "EN"
}
```

**Response (200):**
```json
{
  "answer": "The professor explained recursion as a function that calls itself...",
  "timestamp_refs": ["24:10", "25:03"],
  "source_chunks": [
    { "text": "...", "start": 1450.0, "similarity": 0.92 }
  ],
  "language": "EN"
}
```

---

### Notes

#### `GET /api/notes/{video_id}` 🔒
Get all saved notes for a video.

**Response (200):**
```json
{
  "notes": [
    {
      "id": "uuid",
      "video_timestamp": "24:10",
      "text": "Recursion: A function that calls itself...",
      "chapter": "Peak Finding",
      "is_auto": true,
      "is_bookmarked": false,
      "created_at": "2026-07-26T12:00:00Z"
    }
  ]
}
```

#### `POST /api/notes` 🔒
Create or update a note.

**Request:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "video_timestamp": "24:10",
  "text": "Important: recursion base case",
  "chapter": "Peak Finding"
}
```

---

### Chat History

#### `GET /api/chats/{video_id}` 🔒
Get chat history for a video.

**Response (200):**
```json
{
  "messages": [
    { "id": "uuid", "role": "user", "message": "What is recursion?", "video_timestamp": "24:10", "created_at": "..." },
    { "id": "uuid", "role": "ai", "message": "Recursion is...", "video_timestamp": "24:10", "created_at": "..." }
  ]
}
```

---

### Export

#### `POST /api/export/{video_id}` 🔒
Export notes in the specified format.

**Request:**
```json
{
  "format": "markdown"
}
```

**Response (200):**
- `format=markdown`: Returns `.md` file as `application/octet-stream`
- `format=pdf`: Returns `.pdf` file as `application/pdf`
- `format=notion`: Returns `{ "notion_page_url": "https://notion.so/..." }`

---

## WebSocket API

### `/ws/voice`

Bidirectional WebSocket for real-time voice interaction.

#### Client → Server (Binary)
Audio blob (`audio/webm;codecs=opus`) sent as binary frame.

#### Client → Server (JSON)
Session metadata sent before audio:
```json
{
  "type": "session_start",
  "video_id": "dQw4w9WgXcQ",
  "current_player_time": 1450.0,
  "user_id": "uuid"
}
```

#### Server → Client (JSON)
Agent response:
```json
{
  "type": "agent_response",
  "action": { "type": "SEEK_RELATIVE", "delta": -10 },
  "chat_message": {
    "text": "The professor explained recursion as...",
    "timestamp_refs": ["24:10"],
    "language": "EN"
  },
  "note": {
    "id": "uuid",
    "text": "Recursion: A function that calls itself...",
    "video_timestamp": "24:10"
  },
  "tts_audio_url": "/api/tts/stream/abc123.wav"
}
```

#### Server → Client (Status)
Processing status updates:
```json
{ "type": "status", "stage": "asr", "message": "Transcribing audio..." }
{ "type": "status", "stage": "reasoning", "message": "Thinking..." }
{ "type": "status", "stage": "tts", "message": "Generating audio response..." }
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Video transcript not found",
    "details": { "video_id": "abc123" }
  }
}
```

| HTTP Code | Error Code | Description |
| :---: | :--- | :--- |
| 400 | `BAD_REQUEST` | Invalid request parameters |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Model inference temporarily unavailable |
