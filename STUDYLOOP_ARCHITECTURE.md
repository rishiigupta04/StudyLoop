# STUDYLOOP — Comprehensive System Architecture

> **A Bilingual, Voice-Native Study Copilot for Video-Based Learning**  
> *Turning passive viewing into active learning via LangGraph DAG multi-agent orchestration, TranscriptAPI, Supabase/PostgreSQL + pgvector, Redis caching, and CPU-optimized TTS routing.*  
> **Authors**: Rishiraj Gupta (A018), Ronit Noronha (A023), Nidhi Tiwari (A033), Dhruvi Devalia (A044) — MSc Data Science (Sem 3)

---

## Table of Contents

1. [Executive Summary](#-executive-summary--core-value-proposition)
2. [System Overview](#-system-overview-diagram)
3. [Frontend Architecture](#-frontend-architecture)
4. [Backend & LangGraph DAG Orchestration](#-langgraph-dag-state-graph--multi-agent-orchestration)
5. [LangGraph Node Specifications](#-detailed-langgraph-node-specifications)
6. [Data, Storage & Caching Layer](#-database-caching--ingestion-matrix)
7. [Transcript Ingestion Pipeline](#4-transcriptapi-ingestion-pipeline)
8. [Push-to-Talk Interaction Model](#-push-to-talk-ptt-tilde--keyboard-interaction)
9. [Dual Execution Modes](#-dual-execution-architecture)
10. [Hardware Budget (Mode B)](#-hardware-discipline-strict-6gb-vram-budget-mode-b-on-prem)
11. [API Contract Reference](#-api-contract-reference)
12. [Mobile PTT Fallback](#-mobile-ptt-fallback-floating-mic-fab)
13. [RAG Chunking Strategy](#-rag-chunking-strategy)
14. [Error Handling & Graceful Degradation](#-error-handling--graceful-degradation)
15. [Environment Variables](#-environment-variables)

---

## 🎯 Executive Summary & Core Value Proposition

- **The Problem**: 500 hours of video are uploaded to YouTube every minute—half of it for learning—yet the medium remains fundamentally linear and passive. 70% of new information is forgotten within 24 hours without active reinforcement (*Ebbinghaus Forgetting Curve*).
- **The Solution**: StudyLoop operates as a **real-time copilot during the exact moment of learning**. In-flow voice interactions, semantic seek, automated timestamped notes, and rich transcript ingestion yield measurably higher cognitive retention than post-video review.

### Key Differentiators

| Capability | Description |
| :--- | :--- |
| **Voice-Native PTT (Tilde `~` Hotkey)** | Press-and-hold keyboard shortcut for zero-friction voice queries while video plays |
| **Anti-Spoiler RAG** | Vector search is filtered to `segment_start ≤ current_player_time` |
| **Dual Execution Modes** | Mode A (Cloud APIs via HuggingFace) or Mode B (6GB VRAM on-prem local DL core) |
| **Cross-Lingual (EN/HI/Hinglish)** | Code-mixed Whisper ASR → BGE-M3 multilingual embeddings → bilingual TTS output |
| **LangGraph DAG Orchestration** | Deterministic state-aware multi-agent routing with sub-150ms fast-path actions |

---

## 🏗️ System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Browser)                                │
│  React 19 SPA · Vite 6 · Tailwind CSS · Framer Motion · YouTube IFrame API      │
│  Push-to-Talk (Tilde ~) · WebSocket Audio Client · Supabase Auth                 │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                    │  REST + WebSocket (/ws/voice)
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (FastAPI Async)                               │
│  LangGraph 9-Node DAG · Whisper ASR · Confidence Router · LLM Reasoning          │
│  RAG Retrieval · Notes Summarizer · TTS Router · Response Dispatcher              │
└──────────────────┬────────────────────────────────────┬──────────────────────────┘
                   │                                    │
      ┌────────────▼────────────┐          ┌────────────▼────────────┐
      │  PostgreSQL / Supabase  │          │       Redis Cache       │
      │  + pgvector Extension   │          │   Transcript JSON +     │
      │  profiles · history ·   │          │   Embedding Vectors     │
      │  notes · chats ·        │          └─────────────────────────┘
      │  transcript_embeddings  │
      └─────────────────────────┘
```

---

## 🖥️ Frontend Architecture

### Tech Stack
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| Framework | React 19 + Vite 6 | SPA with HMR dev server |
| Styling | Tailwind CSS 3.4 | Utility-first CSS with custom design tokens |
| Animations | Framer Motion 11 | Physics-based scroll, hover, layout animations |
| Routing | React Router 7 | Client-side SPA navigation |
| State | React Context + Hooks | Lightweight state management |
| Icons | Lucide React + Heroicons | Consistent icon system |
| Charts | Recharts 2 | Study time visualization |
| Toasts | Sonner | Notification system |
| Forms | React Hook Form | Auth & input validation |
| DB Client | @supabase/supabase-js | Auth, profiles, CRUD, pgvector RPC calls |

### Route Map

| Route | Component | Description |
| :--- | :--- | :--- |
| `/` | `LandingPage.tsx` | High-converting SaaS landing page with Auth Modal |
| `/login` | `LoginPage.tsx` | Standalone login/signup page |
| `/dashboard-home` | `DashboardHomePage.tsx` | User dashboard with study stats & recent videos |
| `/video-study-page` | `VideoStudyPage.tsx` | Core study workspace (video + AI agent + notes) |
| `*` | `NotFound.tsx` | 404 fallback |

### Design System: "Electric Indigo & Cyber Glow"

| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--bg-obsidian` | `#0B0E17` | Page background |
| `--surface-card` | `#151926` | Card & panel surfaces |
| `--surface-elevated` | `#1E2235` | Hover states, elevated panels |
| `--primary-indigo` | `#7C3AED` | Primary actions, active states, CTAs |
| `--accent-cyan` | `#06B6D4` | Secondary accent, gradient endpoints |
| `--accent-emerald` | `#10B981` | Success states, progress indicators |
| `--text-primary` | `#F1F5F9` | Primary text |
| `--text-secondary` | `#94A3B8` | Secondary/muted text |
| `--border-subtle` | `#1E293B` | Card borders |

### Component Inventory

| Component | Location | Purpose |
| :--- | :--- | :--- |
| `CursorOrb` | `src/components/ui/CursorOrb.tsx` | Ambient cursor-following light orb |
| `Skeleton` | `src/components/ui/Skeleton.tsx` | Shimmer-sweep loading placeholder |
| `Sidebar` | `src/components/Sidebar.tsx` | Navigation with `layoutId` active indicator |
| `AppLayout` | `src/components/AppLayout.tsx` | Sidebar + main content wrapper |
| `DashboardHero` | `src/app/dashboard-home/components/` | Dashboard header with search bar |
| `StatsBar` | `src/app/dashboard-home/components/` | Study metrics cards |
| `RecentVideosGrid` | `src/app/dashboard-home/components/` | Video history card grid |
| `StudyTimeChart` | `src/app/dashboard-home/components/` | Weekly study time bar chart |
| `LibraryShortcuts` | `src/app/dashboard-home/components/` | Quick-access library links |
| `VideoPane` | `src/app/video-study-page/components/` | YouTube IFrame player wrapper |
| `AIAgentPanel` | `src/app/video-study-page/components/` | Tabbed AI panel (Q&A, Notes, Transcript) |
| `VoiceModal` | `src/app/video-study-page/components/` | PTT recording overlay with waveform |
| `TranscriptTab` | `src/app/video-study-page/components/` | Synced transcript with highlight |
| `QAChatTab` | `src/app/video-study-page/components/` | AI Q&A chat interface |
| `NotesTab` | `src/app/video-study-page/components/` | Auto & manual notes manager |

---

## 🦜 LangGraph DAG State Graph & Multi-Agent Orchestration

StudyLoop executes a **deterministic, state-aware Directed Acyclic Graph (DAG)** built on **LangGraph** within a FastAPI async backend server.

### LangGraph DAG Flow

```
                              ┌─────────────────────────┐
                              │  WebSocket Audio Input  │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │  Audio_Ingestion_Node   │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ ASR_Transcription_Node  │
                              │ (Whisper-Hindi2Hinglish)│
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ Confidence_Router_Node  │
                              └───────┬─────────┬───────┘
                                      │         │
           High Confidence (Action)   │         │  Low Confidence / Q&A / Note
  ┌───────────────────────────────────┘         └───────────────────────────────────┐
  ▼                                                                                 ▼
┌────────────────────────┐                                       ┌────────────────────────┐
│  Action_Executor_Node  │                                       │   RAG_Retrieval_Node   │
│  (Play/Pause/Seek)     │                                       │   (pgvector + BGE-M3)  │
└───────────┬────────────┘                                       └───────────┬────────────┘
            │                                                                │
            │                                                                ▼
            │                                                    ┌────────────────────────┐
            │                                                    │  LLM_Reasoning_Node    │
            │                                                    │  (Qwen2.5 / HF API)    │
            │                                                    └───────────┬────────────┘
            │                                                                │
            │                                           ┌────────────────────┴───────────────────┐
            │                                           ▼                                        ▼
            │                               ┌───────────────────────┐                ┌───────────────────────┐
            │                               │ Notes_Summarizer_Node │                │    TTS_Router_Node    │
            │                               │ (Timestamped Note DB) │                │ (MeloTTS / Indic-TTS) │
            │                               └───────────┬───────────┘                └───────────┬───────────┘
            │                                           │                                        │
            └───────────────────────────────────────────┼────────────────────────────────────────┘
                                                        │
                                                        ▼
                                            ┌───────────────────────┐
                                            │  Response_Dispatcher  │
                                            │  (WebSocket Push)     │
                                            └───────────────────────┘
```

### LangGraph State Schema

```python
from typing import Literal, Optional
from pydantic import BaseModel

class StudyLoopGraphState(BaseModel):
    # Input
    audio_buffer: bytes
    video_id: str
    current_player_time_seconds: float
    user_id: str

    # ASR Output
    raw_transcript_text: Optional[str] = None
    detected_language: Optional[Literal["EN", "HI", "Hinglish"]] = None

    # Router Output
    route_decision: Optional[Literal["ACTION", "QA", "NOTE"]] = None
    confidence_score: Optional[float] = None

    # Action Path
    player_action: Optional[dict] = None  # {"type": "SEEK_RELATIVE", "delta": -10}

    # RAG Path
    retrieved_chunks: Optional[list[dict]] = None
    llm_response_text: Optional[str] = None

    # Notes Path
    generated_note: Optional[dict] = None

    # TTS Path
    tts_audio_url: Optional[str] = None

    # Final Response
    websocket_payload: Optional[dict] = None
```

---

## 🧩 Detailed LangGraph Node Specifications

### `Node 1: Audio_Ingestion_Node`
| Property | Value |
| :--- | :--- |
| **Trigger** | WebSocket audio stream from PTT (Tilde `~` keyup or UI button release) |
| **Process** | Validate audio buffer headers, convert to 16kHz mono WAV, append to `state.audio_buffer` |
| **Output** | `state.audio_buffer` (raw bytes ready for ASR) |
| **Latency** | < 10ms |

### `Node 2: ASR_Transcription_Node`
| Property | Value |
| :--- | :--- |
| **Model** | `OriserveAI/Whisper-Hindi2Hinglish` |
| **Mode A** | HuggingFace Inference API |
| **Mode B** | Local GPU (1.0 GB VRAM) |
| **Output** | `state.raw_transcript_text`, `state.detected_language` |
| **Latency** | ~300–800ms depending on utterance length |

### `Node 3: Confidence_Router_Node`
| Property | Value |
| :--- | :--- |
| **Mode A** | LLM function-calling with `route_intent` tool schema |
| **Mode B** | Fine-tuned DistilBERT ONNX classifier (< 150ms) |
| **Output** | `state.route_decision` ∈ `{ACTION, QA, NOTE}`, `state.confidence_score` |
| **Routing Rules** | |

| Intent Class | Confidence Threshold | Examples | Route |
| :--- | :--- | :--- | :--- |
| `ACTION` | ≥ 0.85 | *"pause"*, *"rewind 10 seconds"*, *"go to chapter 3"* | `Action_Executor_Node` |
| `NOTE` | ≥ 0.80 | *"note this down"*, *"save this part"*, *"bookmark"* | `Notes_Summarizer_Node` |
| `QA` | default | *"what did he say about recursion?"*, *"explain this"* | `RAG_Retrieval_Node` |

### `Node 4: Action_Executor_Node`
| Property | Value |
| :--- | :--- |
| **Latency** | < 150ms (bypasses LLM entirely) |
| **Output** | `state.player_action` JSON pushed directly to `Response_Dispatcher_Node` |

**Supported Actions:**

| Action Type | Payload | Voice Triggers |
| :--- | :--- | :--- |
| `PLAYBACK_STATE` | `{"state": "PLAY\|PAUSE\|MUTE"}` | *"play"*, *"pause"*, *"mute"* |
| `SEEK_RELATIVE` | `{"delta": ±N}` | *"go back 10 seconds"*, *"skip ahead"* |
| `SEEK_CHAPTER` | `{"chapter_index": N}` | *"go to chapter 3"*, *"skip to complexity"* |
| `SEEK_ABSOLUTE` | `{"timestamp": 125.0}` | *"jump to 2 minutes 5 seconds"* |
| `PLAYBACK_SPEED` | `{"speed": 1.5}` | *"speed up"*, *"play at 1.5x"* |

### `Node 5: RAG_Retrieval_Node`
| Property | Value |
| :--- | :--- |
| **Embedding Model** | `BAAI/bge-m3` (1024-dim, cross-lingual) |
| **Vector DB** | PostgreSQL `transcript_embeddings` via `pgvector` |
| **Index Type** | HNSW (sub-50ms similarity search) |
| **Anti-Spoiler SQL** | `WHERE video_id = :v_id AND segment_start <= :current_player_time` |
| **Output** | `state.retrieved_chunks` (top-5 semantically relevant segments) |
| **Match Threshold** | cosine similarity ≥ 0.70 |

### `Node 6: LLM_Reasoning_Node`
| Property | Value |
| :--- | :--- |
| **Mode A Model** | `Qwen/Qwen2.5-72B-Instruct` or `Qwen/Qwen2.5-14B-Instruct` via HuggingFace API key |
| **Mode B Model** | `Qwen2.5-1.5B-Instruct` 4-bit GGUF (1.2 GB VRAM) |
| **System Prompt** | Grounded answering with timestamp citations from `retrieved_chunks` |
| **Output** | `state.llm_response_text` with embedded `[24:10]` timestamp references |
| **Bilingual** | Responds in English or Hindi/Devanagari matching `state.detected_language` |

### `Node 7: Notes_Summarizer_Node`
| Property | Value |
| :--- | :--- |
| **Function** | Extracts core takeaways, formulas, or definitions from current video section |
| **Database** | Inserts into `saved_notes` table with `video_id`, `video_timestamp`, `chapter`, `is_auto=true` |
| **Output** | `state.generated_note` + confirmation message |

### `Node 8: TTS_Router_Node` (CPU Only)
| Property | Value |
| :--- | :--- |
| **English Path** | MeloTTS (Indian English voice profile) |
| **Hindi Path** | MeloTTS (Hindi checkpoint) or Indic-TTS (AI4Bharat) |
| **Execution** | 100% CPU threads — GPU VRAM reserved for ASR + LLM |
| **Output** | `state.tts_audio_url` (streaming audio endpoint) |

### `Node 9: Response_Dispatcher_Node`
| Property | Value |
| :--- | :--- |
| **Function** | Serializes all state outputs into a unified WebSocket JSON payload |

**WebSocket Response Schema:**

```json
{
  "type": "agent_response",
  "action": {"type": "SEEK_RELATIVE", "delta": -10},
  "chat_message": {
    "text": "The professor explained recursion as...",
    "timestamp_refs": ["24:10", "25:03"],
    "language": "EN"
  },
  "note": {
    "id": "note-uuid",
    "text": "Recursion: A function that calls itself...",
    "video_timestamp": "24:10"
  },
  "tts_audio_url": "/api/tts/stream/abc123.wav"
}
```

---

## 🗄️ Database, Caching & Ingestion Matrix

### 1. Relational Database (PostgreSQL / Supabase)

#### `profiles`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Supabase Auth user ID |
| `email` | `TEXT UNIQUE` | User email |
| `full_name` | `TEXT` | Display name |
| `avatar_url` | `TEXT` | Profile picture URL |
| `preferred_language` | `TEXT` | `EN`, `HI`, or `Hinglish` |
| `created_at` | `TIMESTAMPTZ` | Account creation time |

#### `user_video_history`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Auto-generated |
| `user_id` | `UUID FK → profiles` | Owner |
| `video_id` | `TEXT` | YouTube 11-char ID |
| `title` | `TEXT` | Video title |
| `channel` | `TEXT` | Channel name |
| `thumbnail` | `TEXT` | Thumbnail URL |
| `progress_percent` | `INT` | Watch progress (0–100) |
| `last_timestamp` | `TEXT` | Resume position (e.g. `24:10`) |
| `status` | `TEXT` | `not-started`, `in-progress`, `completed` |
| `last_studied_at` | `TIMESTAMPTZ` | Last interaction time |

#### `saved_notes`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Auto-generated |
| `user_id` | `UUID FK → profiles` | Owner |
| `video_id` | `TEXT` | YouTube video ID |
| `video_timestamp` | `TEXT` | Timestamp in video (e.g. `12:15`) |
| `text` | `TEXT` | Note content |
| `chapter` | `TEXT` | Chapter/section tag |
| `is_auto` | `BOOLEAN` | AI-generated (`true`) or manual (`false`) |
| `is_bookmarked` | `BOOLEAN` | User bookmark flag |
| `created_at` | `TIMESTAMPTZ` | Creation time |

#### `saved_chats`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Auto-generated |
| `user_id` | `UUID FK → profiles` | Owner |
| `video_id` | `TEXT` | YouTube video ID |
| `role` | `TEXT` | `user` or `ai` |
| `message` | `TEXT` | Message content |
| `video_timestamp` | `TEXT` | Associated video position |
| `language` | `TEXT` | `EN`, `HI`, or `Hinglish` |
| `is_bookmarked` | `BOOLEAN` | User bookmark flag |
| `created_at` | `TIMESTAMPTZ` | Creation time |

### 2. Vector Database (`pgvector` Extension)

#### `transcript_embeddings`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID PK` | Auto-generated |
| `video_id` | `TEXT` | YouTube video ID |
| `segment_start` | `FLOAT` | Start time in seconds |
| `segment_text` | `TEXT` | Original transcript chunk text |
| `embedding` | `vector(1024)` | BGE-M3 dense embedding |
| `created_at` | `TIMESTAMPTZ` | Ingestion time |

**pgvector RPC Function:**

```sql
CREATE OR REPLACE FUNCTION match_transcript_embeddings(
  target_video_id TEXT,
  query_embedding vector(1024),
  match_threshold FLOAT DEFAULT 0.70,
  match_count INT DEFAULT 5,
  max_start_seconds FLOAT DEFAULT 99999
)
RETURNS TABLE (
  id UUID, segment_start FLOAT, segment_text TEXT, similarity FLOAT
) AS $$
  SELECT id, segment_start, segment_text,
         1 - (embedding <=> query_embedding) AS similarity
  FROM transcript_embeddings
  WHERE video_id = target_video_id
    AND segment_start <= max_start_seconds
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

### 3. Redis Caching Layer (Dockerized)

| Key Pattern | TTL | Value |
| :--- | :--- | :--- |
| `transcript:{video_id}` | 7 days | Full JSON transcript array |
| `embeddings:{video_id}:status` | 7 days | `"READY"` or `"PROCESSING"` |
| `info:{video_id}` | 24 hours | Video metadata + available languages |

### 4. TranscriptAPI Ingestion Pipeline

| Property | Value |
| :--- | :--- |
| **Base URL** | `https://transcriptapi.com/api/v2` |
| **Auth** | `Authorization: Bearer {TRANSCRIPT_API_KEY}` |
| **Credit Pool** | 100 credits |
| **Language Priority** | `hi,asr-hi,en,asr-en` |
| **Response Format** | JSON with timestamps and metadata |
| **Service File** | [`src/services/transcriptService.ts`](file:///d:/StudyLoop%20Web/StudyLoop%20Web/src/services/transcriptService.ts) |

---

## 🎙️ Push-to-Talk (PTT) Tilde (`~`) Keyboard Interaction

```
                       ┌───────────────────────────────────┐
                       │  User holds Tilde (~) key down   │
                       └─────────────────┬─────────────────┘
                                         │
                                         ▼
                       ┌───────────────────────────────────┐
                       │  PTT Audio Capture Active         │
                       │  (Video playback continues)       │
                       └─────────────────┬─────────────────┘
                                         │
                       ┌─────────────────┴─────────────────┐
                       │  User releases Tilde (~) key      │
                       └─────────────────┬─────────────────┘
                                         │
                                         ▼
                       ┌───────────────────────────────────┐
                       │  AI Voice Agent Executes Command  │
                       │  (Fast-path action / RAG Q&A)     │
                       └───────────────────────────────────┘
```

**Implementation Details:**
- **Key**: `Backquote` key code (`` ` `` / `~`) — `event.code === 'Backquote'`
- **Keydown**: Starts `MediaRecorder` with `audio/webm;codecs=opus`, shows pulsing PTT overlay
- **Keyup**: Stops recording, sends audio blob via WebSocket, triggers processing pipeline
- **Guard**: Ignores events when user is typing in `<input>`, `<textarea>`, or `[contenteditable]` fields
- **Visual**: Floating indicator pill *"Hold `~` to Speak"* rendered over the video study workspace

---

## 🔀 Dual Execution Architecture

```
                              ┌────────────────────────┐
                              │    Voice / Text Input   │
                              └───────────┬────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
        ┌──────────▼──────────┐                       ┌──────────▼──────────┐
        │       MODE A        │                       │       MODE B        │
        │ Cloud / Hosted API  │                       │ Evaluated Local DL  │
        │ (HF Inference API)  │                       │  (6GB VRAM On-Prem) │
        └──────────┬──────────┘                       └──────────┬──────────┘
                   │                                             │
 ┌─────────────────┴───────────────┐           ┌─────────────────┴───────────────┐
 │ - TranscriptAPI Ingestion       │           │ - Fine-Tuned DistilBERT ONNX    │
 │ - Supabase DB + pgvector RAG    │           │   (<150ms Fast Path Navigation) │
 │ - Whisper-Hindi2Hinglish API    │           │ - Local Whisper-Hindi2Hinglish  │
 │ - Qwen2.5 LLM via HuggingFace   │           │ - Local Qwen2.5-1.5B (4-bit)    │
 │   API Key (Structured JSON)    │           │ - Local BGE-M3 & MeloTTS (CPU)  │
 │ - BAAI/BGE-M3 Embeddings API    │           └─────────────────────────────────┘
 │ - MeloTTS / Indic-TTS API (CPU) │
 └─────────────────────────────────┘
```

---

## 💾 Hardware Discipline: Strict 6GB VRAM Budget (Mode B On-Prem)

| Component | Format | VRAM | Execution |
| :--- | :--- | :--- | :--- |
| **Qwen2.5-1.5B-Instruct** | 4-bit GGUF | ~1.2 GB | GPU |
| **DistilBERT ONNX** | Fine-tuned classifier | ~0.2 GB | GPU |
| **Whisper-Hindi2Hinglish** | ASR model | ~1.0 GB | GPU |
| **BAAI/BGE-M3** | Embeddings | 0.0 GB | **CPU** |
| **MeloTTS / Indic-TTS** | Speech synthesis | 0.0 GB | **CPU** |
| **TOTAL** | — | **~2.4 GB** | **Within 6.0 GB** |

---

## 📡 API Contract Reference

### REST Endpoints (FastAPI)

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Login with email/password | Public |
| `POST` | `/api/auth/register` | Create new account | Public |
| `GET` | `/api/auth/me` | Get current user profile | Bearer |
| `POST` | `/api/videos/process` | Submit video URL for transcript ingestion | Bearer |
| `GET` | `/api/videos/{video_id}/transcript` | Get cached transcript | Bearer |
| `GET` | `/api/videos/{video_id}/chapters` | Get auto-generated chapters | Bearer |
| `POST` | `/api/qa/ask` | Submit text Q&A query | Bearer |
| `GET` | `/api/notes/{video_id}` | Get saved notes for a video | Bearer |
| `POST` | `/api/notes` | Create/update a note | Bearer |
| `GET` | `/api/chats/{video_id}` | Get chat history for a video | Bearer |
| `POST` | `/api/export/{video_id}` | Export notes to PDF/MD/Notion | Bearer |

### WebSocket Endpoints

| Endpoint | Direction | Payload |
| :--- | :--- | :--- |
| `/ws/voice` | Client → Server | Audio blob (WebM/Opus) + `{video_id, current_time}` |
| `/ws/voice` | Server → Client | `{action, chat_message, note, tts_audio_url}` |

---

## 📱 Mobile PTT Fallback: Floating Mic FAB

The Tilde (`~`) key does not exist on mobile keyboards. On touch devices, StudyLoop renders a **Floating Action Button (FAB)** as the mobile PTT trigger:

| Platform | PTT Trigger | Behaviour |
| :--- | :--- | :--- |
| **Desktop** | Hold Tilde (`~`) key | `keydown` → start recording, `keyup` → stop & send |
| **Mobile / Tablet** | Tap-and-hold Mic FAB | `touchstart` → start recording, `touchend` → stop & send |

**Detection Logic:**
```typescript
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// If touch → render floating mic FAB (bottom-right, above video controls)
// If desktop → render "Hold ~ to Speak" indicator pill
```

**FAB Design:**
- Position: Fixed bottom-right (`right: 24px, bottom: 80px`) above YouTube player controls
- Appearance: 56px circular button, `bg-indigo-600` with pulsing glow ring when recording
- Haptic: `navigator.vibrate(50)` on `touchstart` for tactile recording confirmation

---

## 🧩 RAG Chunking Strategy

Transcript segments from TranscriptAPI are raw subtitle lines (typically 2–8 words each). These must be merged and re-chunked for high-quality embedding search.

### Chunking Pipeline

```
Raw TranscriptAPI Segments (2–8 words each)
        │
        ▼
Merge into Sentences (by punctuation + duration gaps > 1.5s)
        │
        ▼
Group into Chunks (3–5 sentences per chunk, ~150–300 tokens)
        │
        ▼
Apply 1-sentence overlap between adjacent chunks
        │
        ▼
Embed each chunk with BGE-M3 → Store in pgvector
```

### Chunking Parameters

| Parameter | Value | Rationale |
| :--- | :--- | :--- |
| **Chunk Size** | 3–5 sentences (~150–300 tokens) | Balances semantic density with retrieval precision |
| **Overlap** | 1 sentence between adjacent chunks | Prevents information loss at chunk boundaries |
| **Chapter-Aware** | Split at chapter boundaries even if chunk is smaller | Prevents cross-topic contamination |
| **Min Chunk Size** | 2 sentences | Avoids single-sentence fragments with weak embeddings |
| **Timestamp Assignment** | `segment_start` = start time of first sentence in chunk | Enables click-to-seek from RAG results |

### Example

```
Chunk 1 (0:00–4:32):
  "Welcome to 6.006, Introduction to Algorithms.
   My name is Erik Demaine and this is my co-lecturer, Jason Ku.
   This course is about how to solve computational problems."
  → segment_start: 0.0

Chunk 2 (3:15–12:15):  ← 1-sentence overlap with Chunk 1
  "This course is about how to solve computational problems.
   An algorithm is a computational procedure for solving a problem.
   What makes a good algorithm? Correctness, efficiency, and clarity."
  → segment_start: 195.0
```

---

## 🛡️ Error Handling & Graceful Degradation

Every failure mode has a defined fallback so the app never breaks:

| Scenario | Detection | Fallback |
| :--- | :--- | :--- |
| **No captions on video** | TranscriptAPI returns `404` | Show "No transcript available" banner, disable Q&A tab, keep manual notes functional |
| **TranscriptAPI credits exhausted** | `429` response | Show "Transcript temporarily unavailable" toast, fall back to YouTube's built-in captions overlay |
| **Mic permission denied** | `NotAllowedError` from `getUserMedia` | Show "Microphone access required" modal with browser settings link, keep text-based Q&A functional |
| **WebSocket disconnect** | `onclose` / `onerror` event | Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s), queue pending audio blobs, show "Reconnecting..." status pill |
| **ASR returns empty text** | `raw_transcript_text` is blank | Show "Couldn't catch that, please try again" toast, don't submit empty query |
| **LLM API timeout** | Response > 15s | Show "Taking longer than expected..." status, cancel after 30s with "Please try again" |
| **Supabase unavailable** | Fetch throws `TypeError` | Use local `localStorage` cache for notes/chats, sync when connection restores |
| **YouTube IFrame fails** | `onError` event | Show "Video unavailable" placeholder with retry button |
| **`VITE_TRANSCRIPT_API_KEY` missing** | `import.meta.env` check | Service returns high-quality mock data for full demo experience |
| **`VITE_SUPABASE_URL` missing** | `isSupabaseConfigured()` check | All service functions return mock profiles, history, and notes |

### Retry Strategy

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('Unreachable');
}
```

---

## 🔐 Environment Variables

| Variable | Layer | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase anonymous API key |
| `VITE_TRANSCRIPT_API_KEY` | Frontend | TranscriptAPI bearer token |
| `VITE_SITE_URL` | Frontend | Public site URL |
| `HF_API_KEY` | Backend | HuggingFace Inference API key |
| `REDIS_URL` | Backend | Redis connection string |
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `SECRET_KEY` | Backend | JWT signing secret |
