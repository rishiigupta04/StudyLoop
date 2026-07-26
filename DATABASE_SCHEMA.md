# STUDYLOOP — Database Schema Reference

> Complete SQL DDL for PostgreSQL + pgvector. Run in Supabase SQL Editor or via `psql`.

---

## Prerequisites

```sql
-- Enable pgvector extension (run once per database)
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Tables

### `profiles`

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY,  -- Matches Supabase Auth user ID
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  preferred_language TEXT DEFAULT 'EN' CHECK (preferred_language IN ('EN', 'HI', 'Hinglish')),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Auto-create profile on Supabase Auth sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### `user_video_history`

```sql
CREATE TABLE IF NOT EXISTS public.user_video_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_id          TEXT NOT NULL,
  title             TEXT NOT NULL,
  channel           TEXT NOT NULL,
  thumbnail         TEXT,
  progress_percent  INT DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  last_timestamp    TEXT DEFAULT '0:00',
  status            TEXT DEFAULT 'in-progress' CHECK (status IN ('not-started', 'in-progress', 'completed')),
  last_studied_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(user_id, video_id)
);

CREATE INDEX idx_video_history_user ON public.user_video_history(user_id);
CREATE INDEX idx_video_history_recent ON public.user_video_history(last_studied_at DESC);
```

### `saved_notes`

```sql
CREATE TABLE IF NOT EXISTS public.saved_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_id        TEXT NOT NULL,
  video_timestamp TEXT NOT NULL,
  text            TEXT NOT NULL,
  chapter         TEXT,
  is_auto         BOOLEAN DEFAULT false,
  is_bookmarked   BOOLEAN DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_notes_user_video ON public.saved_notes(user_id, video_id);
CREATE INDEX idx_notes_bookmarked ON public.saved_notes(user_id, is_bookmarked) WHERE is_bookmarked = true;
```

### `saved_chats`

```sql
CREATE TABLE IF NOT EXISTS public.saved_chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_id        TEXT NOT NULL,
  role            TEXT CHECK (role IN ('user', 'ai')) NOT NULL,
  message         TEXT NOT NULL,
  video_timestamp TEXT,
  language        TEXT DEFAULT 'EN' CHECK (language IN ('EN', 'HI', 'Hinglish')),
  is_bookmarked   BOOLEAN DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_chats_user_video ON public.saved_chats(user_id, video_id);
CREATE INDEX idx_chats_bookmarked ON public.saved_chats(user_id, is_bookmarked) WHERE is_bookmarked = true;
```

### `transcript_embeddings` (pgvector)

```sql
CREATE TABLE IF NOT EXISTS public.transcript_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      TEXT NOT NULL,
  segment_start FLOAT NOT NULL,
  segment_text  TEXT NOT NULL,
  embedding     vector(1024),  -- BGE-M3 1024-dimensional dense embeddings
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX idx_embeddings_hnsw ON public.transcript_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

CREATE INDEX idx_embeddings_video ON public.transcript_embeddings(video_id);
```

---

## RPC Functions

### `match_transcript_embeddings`

Semantic similarity search with anti-spoiler time boundary filter.

```sql
CREATE OR REPLACE FUNCTION match_transcript_embeddings(
  target_video_id   TEXT,
  query_embedding   vector(1024),
  match_threshold   FLOAT DEFAULT 0.70,
  match_count       INT DEFAULT 5,
  max_start_seconds FLOAT DEFAULT 99999
)
RETURNS TABLE (
  id              UUID,
  segment_start   FLOAT,
  segment_text    TEXT,
  similarity      FLOAT
) AS $$
  SELECT
    te.id,
    te.segment_start,
    te.segment_text,
    1 - (te.embedding <=> query_embedding) AS similarity
  FROM public.transcript_embeddings te
  WHERE te.video_id = target_video_id
    AND te.segment_start <= max_start_seconds
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

---

## Row Level Security (RLS) Policies

```sql
-- Enable RLS on all user-scoped tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_video_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_chats ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Video History: users can only access their own history
CREATE POLICY "Users can CRUD own video history"
  ON public.user_video_history FOR ALL
  USING (auth.uid() = user_id);

-- Notes: users can only access their own notes
CREATE POLICY "Users can CRUD own notes"
  ON public.saved_notes FOR ALL
  USING (auth.uid() = user_id);

-- Chats: users can only access their own chats
CREATE POLICY "Users can CRUD own chats"
  ON public.saved_chats FOR ALL
  USING (auth.uid() = user_id);

-- Embeddings: readable by all authenticated users (shared resource)
ALTER TABLE public.transcript_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read embeddings"
  ON public.transcript_embeddings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert embeddings"
  ON public.transcript_embeddings FOR INSERT
  TO service_role
  WITH CHECK (true);
```
