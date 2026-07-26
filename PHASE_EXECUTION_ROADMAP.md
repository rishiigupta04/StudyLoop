# STUDYLOOP — Phase-by-Phase Execution Roadmap

> **Strategy**: Incremental, non-breaking development roadmap. Each phase has explicit entry criteria, deliverables, verification gates, and rollback boundaries. No phase proceeds until the previous phase passes its verification gate.

---

## 🧭 Master Roadmap

```
 PHASE 1 ────► PHASE 2 ────► PHASE 3 ────► PHASE 4 ────► PHASE 5
  Frontend      Player        Voice         Backend       Production
  & Landing     Loop          Bridge        + DAG         RAG + Export
  (ACTIVE)
```

| Phase | Title | Depends On | Status |
| :---: | :--- | :---: | :---: |
| **1** | Frontend UI/UX, $1M Landing Page, Tilde PTT & Service Contracts | — | 🟡 Active |
| **2** | Interactive Video Player Loop & Dual-Mode Intent Contract | Phase 1 | ⬜ Planned |
| **3** | Voice Bridge & WebSocket Audio Streaming | Phase 2 | ⬜ Planned |
| **4** | FastAPI Gateway, LangGraph 9-Node DAG & Redis Caching | Phase 3 | ⬜ Planned |
| **5** | Full pgvector RAG, Anti-Spoiler Search & Document Exporters | Phase 4 | ⬜ Planned |

---

## 🚀 Phase 1: Frontend UI/UX, $1M Landing Page & Service Contracts

**Goal**: Deliver a world-class SaaS landing page, production app shell with fluid animations, keyboard PTT indicator, and data service contracts that can operate against mock data until the backend is connected.

**Entry Criteria**: Existing React 19 + Vite 6 + Tailwind SPA compiles and runs.

### Deliverables

#### 1.1 Design System: "Electric Indigo & Cyber Glow"
| File | Changes |
| :--- | :--- |
| `tailwind.config.js` | Custom colors (`obsidian`, `indigo`, `cyan`, `emerald`), box shadows (`glow-indigo`, `glow-cyan`), extended animations (`shimmer`, `float`, `pulse-ring`) |
| `src/styles/tailwind.css` | CSS custom properties for theme tokens, glassmorphic utility classes, `.skeleton-shimmer` keyframes |

#### 1.2 Core Reusable Components
| Component | File | Purpose |
| :--- | :--- | :--- |
| `CursorOrb` | `src/components/ui/CursorOrb.tsx` | Ambient cursor-following radial gradient orb using Framer Motion `useMotionValue` + `useSpring` |
| `Skeleton` | `src/components/ui/Skeleton.tsx` | Configurable shimmer loader (text, card, avatar, chart variants) |

#### 1.3 SaaS Landing Page (`/`)
| Section | Description |
| :--- | :--- |
| **Glass Navbar** | Logo, feature nav links, "Sign In" ghost button, "Get Started Free" CTA |
| **Hero** | Headline (*"Talk to Any YouTube Video in Real Time with AI"*), subtitle, interactive URL trial bar, floating AI model badges, product mockup frame |
| **Social Proof** | University trust logos (MIT, Stanford, Harvard, IITs) + user count |
| **Problem vs Solution** | Side-by-side comparison card (2-hour passive → 15-min active recall) |
| **Feature Grid** | 4 interactive cards with Framer Motion hover tilt (Voice PTT, Semantic Q&A, Auto Notes, Multilingual) |
| **How It Works** | 3-step visual workflow roadmap |
| **Testimonials** | Wall of Love with student review cards |
| **FAQ Accordion** | Interactive expand/collapse with spring animation |
| **Footer CTA** | Final conversion banner + footer links |
| **Auth Modal** | Embedded login/signup modal with demo credentials autofill |

#### 1.4 Framer Motion Micro-Interactions
| Target | Animation |
| :--- | :--- |
| Landing sections | `whileInView` staggered fade-up reveals |
| Feature cards | `whileHover` scale + shadow lift |
| FAQ items | `AnimatePresence` spring expand/collapse |
| Sidebar active pill | `layoutId` smooth indicator transition |
| Stats cards | Counter increment animation on mount |

#### 1.5 Tilde (`~`) PTT Visual Indicator
- Floating indicator pill *"Hold `~` to Speak"* rendered over the video study workspace
- On `keydown('Backquote')`: Show pulsing recording overlay
- On `keyup('Backquote')`: Hide overlay, display "Processing..." state
- Guarded against input/textarea/contenteditable focus

#### 1.6 Service Layer Contracts
| Service | File | Description |
| :--- | :--- | :--- |
| TranscriptAPI | `src/services/transcriptService.ts` | `fetchVideoInfo()`, `fetchVideoTranscript()` with `hi,asr-hi,en,asr-en` priority, mock fallback |
| Supabase | `src/services/supabaseService.ts` | `fetchUserProfile()`, `matchSemanticEmbeddings()` RPC, type contracts, mock fallback |

#### 1.7 Existing Component Theme Upgrade
| Component | Changes |
| :--- | :--- |
| `Sidebar.tsx` | Obsidian background, indigo active indicator with `layoutId`, subtle hover glow |
| `DashboardHero.tsx` | "AI Command Station" hero header with staggered entrance |
| `StatsBar.tsx` | Glassmorphic stat cards with indigo-cyan gradient borders |
| `RecentVideosGrid.tsx` | Dark cards with hover tilt, skeleton loading states |
| `LibraryShortcuts.tsx` | Indigo icon accents, hover brightness lift |
| `StudyTimeChartInner.tsx` | Indigo-to-cyan gradient bar fills |
| `VoiceModal.tsx` | Audio waveform visualizer stub, Tilde key indicator |

#### 1.8 Routing Update
| Route | Component |
| :--- | :--- |
| `/` | `LandingPage` (new) |
| `/login` | `LoginPage` (existing) |
| `/dashboard-home` | `DashboardHomePage` (existing) |
| `/video-study-page` | `VideoStudyPage` (existing) |
| `*` | `NotFound` (existing) |

### Verification Gate
- [ ] `npm install` completes without errors
- [ ] `npm run type-check` (`tsc --noEmit`) — 0 errors
- [ ] `npm run build` (`vite build`) — clean production bundle
- [ ] `npm run dev` — Landing page renders at `http://localhost:4028/`
- [ ] CursorOrb tracks mouse on landing page
- [ ] Auth modal opens from CTA buttons
- [ ] Dashboard and video study pages render with new theme
- [ ] Tilde key indicator visible on video study page

---

## ⚡ Phase 2: Interactive Video Player Loop & Dual-Mode Intent Contract

**Goal**: Wire YouTube IFrame API for bidirectional playback control, sync transcript highlighting, and define the intent routing JSON schema.

**Entry Criteria**: Phase 1 verification gate passed.

### Deliverables

#### 2.1 YouTube Player Integration
| Deliverable | Description |
| :--- | :--- |
| `useYouTubePlayer` hook | Load IFrame API, expose `play()`, `pause()`, `seekTo()`, `getCurrentTime()`, `getPlayerState()` |
| Player state machine | React context tracking `UNSTARTED`, `PLAYING`, `PAUSED`, `BUFFERING`, `ENDED` |
| Time sync interval | 500ms polling loop updating `currentPlayerTime` in context |

#### 2.2 Transcript Sync
| Deliverable | Description |
| :--- | :--- |
| Active segment highlight | Auto-scroll `TranscriptTab` to current segment based on `currentPlayerTime` |
| Click-to-seek | Click any transcript segment → `player.seekTo(segment.start)` |
| Chapter markers | Render chapter boundaries in transcript view |

#### 2.3 Tier-0 Action Handler Contract
| Deliverable | Description |
| :--- | :--- |
| `PlayerActionSchema` | TypeScript interface for `{type, delta?, chapter_index?, timestamp?, speed?, state?}` |
| `executePlayerAction()` | Dispatcher function mapping action JSON → IFrame API calls |
| Dual-mode JSON schema | Unified schema accepting both LLM function-calling output and DistilBERT ONNX classifier output |

### Verification Gate
- [ ] YouTube video plays embedded within `VideoPane`
- [ ] Transcript auto-highlights current segment
- [ ] Click-to-seek works from transcript
- [ ] `executePlayerAction({type: "SEEK_RELATIVE", delta: -10})` rewinds video
- [ ] `npm run type-check` and `npm run build` pass

---

## 🎙️ Phase 3: Voice Bridge & WebSocket Audio Streaming

**Goal**: Implement real audio recording via Push-to-Talk and establish the WebSocket communication channel.

**Entry Criteria**: Phase 2 verification gate passed.

### Deliverables

#### 3.1 Audio Recording Hook
| Deliverable | Description |
| :--- | :--- |
| `useAudioRecorder` hook | `MediaRecorder` with `audio/webm;codecs=opus`, start/stop via PTT state |
| Tilde key binding | Wire `keydown`/`keyup` on `Backquote` to `startRecording()`/`stopRecording()` |
| Audio blob dispatch | On stop, emit `Blob` to WebSocket send queue |

#### 3.2 WebSocket Client
| Deliverable | Description |
| :--- | :--- |
| `useWebSocket` hook | Connect to `/ws/voice`, handle open/close/error/reconnect, binary + JSON messaging |
| Message handler | Parse incoming `{action, chat_message, note, tts_audio_url}` payloads |
| Action dispatcher | Route `action` payloads to `executePlayerAction()` from Phase 2 |

#### 3.3 Audio Visualization
| Deliverable | Description |
| :--- | :--- |
| `AnalyserNode` integration | Connect `MediaStream` to `WebAudio AnalyserNode` |
| Waveform renderer | Canvas-based frequency bar visualization in `VoiceModal` |

### Verification Gate
- [ ] Hold Tilde `~` → microphone activates (browser permission prompt appears once)
- [ ] Release Tilde `~` → audio blob is created (verified via console log)
- [ ] WebSocket connects to backend URL (or logs connection attempt)
- [ ] Waveform bars animate during recording
- [ ] `npm run type-check` and `npm run build` pass

---

## 🧩 Phase 4: FastAPI Gateway, LangGraph 9-Node DAG & Redis Caching

**Goal**: Build the Python backend server with LangGraph orchestration connecting ASR, intent routing, RAG, LLM reasoning, notes, TTS, and response dispatch.

**Entry Criteria**: Phase 3 verification gate passed.

### Deliverables

#### 4.1 FastAPI Server Setup
| Deliverable | Description |
| :--- | :--- |
| Project scaffold | FastAPI app with CORS, WebSocket endpoint, health check |
| Auth middleware | Supabase JWT verification for REST endpoints |
| Docker Compose | PostgreSQL + Redis + FastAPI services |

#### 4.2 LangGraph 9-Node DAG
| Node | Implementation |
| :--- | :--- |
| `Audio_Ingestion_Node` | Validate + convert to 16kHz WAV |
| `ASR_Transcription_Node` | `Whisper-Hindi2Hinglish` via HF API (Mode A) or local (Mode B) |
| `Confidence_Router_Node` | LLM function-calling (Mode A) or DistilBERT ONNX (Mode B) |
| `Action_Executor_Node` | Build player action JSON, skip LLM |
| `RAG_Retrieval_Node` | BGE-M3 embedding → pgvector search with anti-spoiler filter |
| `LLM_Reasoning_Node` | Qwen2.5 via HF API (Mode A) or local GGUF (Mode B) |
| `Notes_Summarizer_Node` | Extract takeaways, insert into `saved_notes` |
| `TTS_Router_Node` | MeloTTS English / MeloTTS Hindi / Indic-TTS (CPU only) |
| `Response_Dispatcher_Node` | Serialize to WebSocket JSON |

#### 4.3 Redis Caching
| Deliverable | Description |
| :--- | :--- |
| Transcript cache | Cache TranscriptAPI JSON response per `video_id` (7-day TTL) |
| Embedding status | Track per-video embedding generation status |
| Cache-aside pattern | Check Redis → miss → fetch TranscriptAPI → store → return |

#### 4.4 REST Endpoints
| Endpoint | Description |
| :--- | :--- |
| `POST /api/videos/process` | Ingest video URL, fetch transcript, generate embeddings |
| `GET /api/videos/{id}/transcript` | Return cached transcript |
| `POST /api/qa/ask` | Text-based Q&A (non-voice path) |
| `GET /api/notes/{video_id}` | Fetch saved notes |
| `POST /api/notes` | Create/update note |

### Verification Gate
- [ ] `docker compose up` starts all services
- [ ] `POST /api/videos/process` returns transcript for a real YouTube URL
- [ ] Voice PTT round-trip: speak → ASR → intent → response via WebSocket
- [ ] Redis caches transcript (second request returns `X-Cache-Status: HIT`)
- [ ] Notes saved to PostgreSQL and retrievable via API

---

## 🔍 Phase 5: Full pgvector RAG, Anti-Spoiler Search & Document Exporters

**Goal**: Production-grade semantic search with anti-spoiler enforcement and multi-format note export.

**Entry Criteria**: Phase 4 verification gate passed.

### Deliverables

#### 5.1 pgvector RAG Engine
| Deliverable | Description |
| :--- | :--- |
| Chunking strategy | Split transcript into 3–5 sentence chunks with 1-sentence overlap |
| BGE-M3 embedding | Batch embed chunks via HF API or local CPU |
| HNSW index | `CREATE INDEX ON transcript_embeddings USING hnsw (embedding vector_cosine_ops)` |
| Semantic search | `match_transcript_embeddings()` RPC function (see Architecture doc) |

#### 5.2 Anti-Spoiler Guardrail
| Deliverable | Description |
| :--- | :--- |
| Time-boundary filter | `WHERE segment_start <= :current_player_time` on all RAG queries |
| Client enforcement | Frontend sends `current_time` with every Q&A request |
| Bypass toggle | Optional "include all" flag for post-video review mode |

#### 5.3 Document Exporters
| Format | Implementation |
| :--- | :--- |
| **Markdown** | Render notes as `.md` with timestamps as headers, download via `Blob` |
| **PDF** | Server-side render via `reportlab` or `weasyprint` |
| **Notion** | Notion API integration (`POST /v1/pages`) with database template |
| **Google Docs** | Google Docs API with template-based insertion |

### Verification Gate
- [ ] Ask Q&A about content at 10:00 while video is at 12:00 → returns grounded answer
- [ ] Ask Q&A about content at 15:00 while video is at 12:00 → returns "not covered yet"
- [ ] Export notes as Markdown → downloads valid `.md` file
- [ ] Export notes as PDF → downloads formatted PDF
- [ ] `npm run type-check` and `npm run build` pass

---

## 🛡️ Stability & Non-Breaking Execution Rules

1. **Incremental Isolation**: Every new feature must fall back gracefully. Services return mock data when API keys are missing.
2. **TypeScript Strict**: `npm run type-check` (`tsc --noEmit`) must pass with 0 errors before ending any phase.
3. **Clean Build Gate**: `npm run build` (`vite build`) must produce a clean production bundle after every phase.
4. **No NEXT_PUBLIC_ Variables**: All environment variables use `VITE_` prefix for Vite compatibility.
5. **Component Purity**: UI components must not import backend-only modules. Service layer provides the abstraction boundary.
6. **Mock-First Development**: Every service function must return realistic mock data when credentials are unconfigured, enabling full frontend development without backend dependencies.
