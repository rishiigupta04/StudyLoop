-- StudyLoop schema v2 (roadmap §4). Run once in Supabase → SQL Editor.
-- Idempotent where practical. Replaces DATABASE_SCHEMA.md (v1: transcript_embeddings, saved_chats).

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles (unchanged from v1)
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text unique,
  full_name          text,
  avatar_url         text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- videos (shared cache; replaces the "processed" flag)
do $$ begin
  create type ingest_status as enum ('pending','fetching','transcribing','embedding','ready','unavailable','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type transcript_source as enum ('creator','youtube_asr','api_generated');
exception when duplicate_object then null; end $$;

create table if not exists public.videos (
  video_id          text primary key,
  title             text,
  channel           text,
  thumbnail_url     text,
  duration_s        double precision,
  transcript_lang   text,
  transcript_source transcript_source,
  has_transcript    boolean not null default false,
  ingest_status     ingest_status not null default 'pending',
  fail_reason       text,
  embed_model       text,
  embed_dim         int,
  chapters          jsonb,
  summary           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- raw segments (for the transcript tab + click-to-seek)
create table if not exists public.transcript_segments (
  video_id   text not null references public.videos(video_id) on delete cascade,
  idx        int not null,
  start_s    double precision not null,
  duration_s double precision not null,
  text       text not null,
  primary key (video_id, idx)
);

-- retrieval chunks (end_s is required for the anti-spoiler filter, roadmap D7)
create table if not exists public.transcript_chunks (
  id        uuid primary key default gen_random_uuid(),
  video_id  text not null references public.videos(video_id) on delete cascade,
  idx       int not null,
  start_s   double precision not null,
  end_s     double precision not null,
  text      text not null,
  fts       tsvector generated always as (to_tsvector('simple', text)) stored,
  embedding vector(1024),
  unique (video_id, idx)
);
create index if not exists transcript_chunks_video_idx on public.transcript_chunks (video_id, start_s);
create index if not exists transcript_chunks_fts_idx on public.transcript_chunks using gin (fts);
create index if not exists transcript_chunks_hnsw on public.transcript_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------- per-user
create table if not exists public.user_video_history (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  video_id        text not null references public.videos(video_id) on delete cascade,
  last_position_s double precision not null default 0,
  max_watched_s   double precision not null default 0,
  status          text not null default 'in-progress' check (status in ('not-started','in-progress','completed')),
  last_studied_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists uvh_recent_idx on public.user_video_history (user_id, last_studied_at desc);

-- one viewing session = one LangGraph thread_id
create table if not exists public.study_sessions (
  session_id    uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  video_id      text not null references public.videos(video_id) on delete cascade,
  language      text not null default 'en' check (language in ('en','hi')),
  max_watched_s double precision not null default 0,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  video_id      text not null references public.videos(video_id) on delete cascade,
  session_id    uuid references public.study_sessions(session_id) on delete set null,
  at_s          double precision not null,
  raw_text      text not null,
  summary       text,
  is_auto       boolean not null default false,
  is_bookmarked boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notes_user_video_idx on public.notes (user_id, video_id, at_s);

-- every turn, for model monitoring (Tier 1f) — written by the backend (service role)
create table if not exists public.interaction_logs (
  turn_id         uuid primary key,
  session_id      uuid references public.study_sessions(session_id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  raw_text        text not null,
  normalized_text text,
  language        text,
  intent          text,
  confidence      real,
  route           text,
  slots           jsonb,
  timings         jsonb,
  model_version   text,
  user_correction boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists interaction_logs_time_idx on public.interaction_logs (created_at desc);
create index if not exists interaction_logs_intent_idx on public.interaction_logs (intent, created_at desc);

-- ---------------------------------------------------------------- retrieval RPC (anti-spoiler aware)
create or replace function public.match_chunks(
  target_video_id text,
  query_embedding vector(1024),
  max_end_s       double precision default null,   -- null = whole video (semantic seek)
  match_count     int default 6
) returns table (id uuid, idx int, start_s double precision, end_s double precision, text text, similarity double precision)
language sql stable as $$
  select c.id, c.idx, c.start_s, c.end_s, c.text, 1 - (c.embedding <=> query_embedding) as similarity
  from public.transcript_chunks c
  where c.video_id = target_video_id
    and (max_end_s is null or c.end_s <= max_end_s)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.videos              enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.transcript_chunks   enable row level security;
alter table public.user_video_history  enable row level security;
alter table public.study_sessions      enable row level security;
alter table public.notes               enable row level security;
alter table public.interaction_logs    enable row level security;

do $$ begin
  create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
  create policy "read videos" on public.videos for select to authenticated using (true);
  create policy "read segments" on public.transcript_segments for select to authenticated using (true);
  create policy "read chunks" on public.transcript_chunks for select to authenticated using (true);
  create policy "own history" on public.user_video_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own sessions" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own notes" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own logs read" on public.interaction_logs for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
-- Writes to videos / segments / chunks / interaction_logs happen via the backend's service role (bypasses RLS).

-- LangGraph checkpointer tables are created by AsyncPostgresSaver.setup() from the backend (Tier 1b).
