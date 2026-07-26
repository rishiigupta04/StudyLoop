/**
 * Supabase & pgvector Service for StudyLoop Web
 * Handles User Profiles, Video Interaction History, Saved Notes, Saved Chats, and Semantic RAG Embeddings.
 */

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  preferred_language: 'EN' | 'HI' | 'Hinglish';
}

export interface VideoInteractionHistory {
  id: string;
  user_id: string;
  video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
  progress_percent: number;
  last_timestamp: string;
  status: 'completed' | 'in-progress' | 'not-started';
  last_studied_at: string;
}

export interface SavedNote {
  id: string;
  user_id: string;
  video_id: string;
  video_timestamp: string;
  text: string;
  chapter: string;
  is_auto: boolean;
  is_bookmarked: boolean;
  created_at: string;
}

export interface SavedChatMessage {
  id: string;
  user_id: string;
  video_id: string;
  role: 'user' | 'ai';
  message: string;
  video_timestamp?: string;
  language: 'EN' | 'HI' | 'Hinglish';
  is_bookmarked: boolean;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Check if Supabase credentials are bound
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * SQL Schema DDL Reference for Supabase Dashboard (with pgvector)
 *
 * CREATE EXTENSION IF NOT EXISTS vector;
 *
 * CREATE TABLE IF NOT EXISTS public.profiles (
 *   id UUID PRIMARY KEY,
 *   email TEXT UNIQUE NOT NULL,
 *   full_name TEXT,
 *   avatar_url TEXT,
 *   preferred_language TEXT DEFAULT 'EN',
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS public.user_video_history (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
 *   video_id TEXT NOT NULL,
 *   title TEXT NOT NULL,
 *   channel TEXT NOT NULL,
 *   thumbnail TEXT,
 *   progress_percent INT DEFAULT 0,
 *   last_timestamp TEXT DEFAULT '0:00',
 *   status TEXT DEFAULT 'in-progress',
 *   last_studied_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS public.saved_notes (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
 *   video_id TEXT NOT NULL,
 *   video_timestamp TEXT NOT NULL,
 *   text TEXT NOT NULL,
 *   chapter TEXT,
 *   is_auto BOOLEAN DEFAULT false,
 *   is_bookmarked BOOLEAN DEFAULT false,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS public.saved_chats (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
 *   video_id TEXT NOT NULL,
 *   role TEXT CHECK (role IN ('user', 'ai')),
 *   message TEXT NOT NULL,
 *   video_timestamp TEXT,
 *   language TEXT DEFAULT 'EN',
 *   is_bookmarked BOOLEAN DEFAULT false,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 * );
 *
 * CREATE TABLE IF NOT EXISTS public.transcript_embeddings (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   video_id TEXT NOT NULL,
 *   segment_start FLOAT NOT NULL,
 *   segment_text TEXT NOT NULL,
 *   embedding vector(1024), -- BGE-M3 1024-dim embeddings
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
 * );
 */

/**
 * Mock Profile Data for local demo state
 */
export const MOCK_USER_PROFILE: UserProfile = {
  id: 'usr-arjun-001',
  email: 'student@studyloop.ai',
  full_name: 'Arjun Sharma',
  preferred_language: 'EN',
  avatar_url: '',
};

/**
 * Fetch User Profile with Supabase or fallback
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  if (!isSupabaseConfigured()) {
    return MOCK_USER_PROFILE;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error('Supabase request failed');
    const data = await res.json();
    return data[0] || MOCK_USER_PROFILE;
  } catch (err) {
    console.warn('Supabase profile fetch failed, using mock:', err);
    return MOCK_USER_PROFILE;
  }
}

/**
 * Search pgvector RAG embeddings function contract
 */
export async function matchSemanticEmbeddings(
  videoId: string,
  queryEmbedding: number[],
  matchCount: number = 5,
  maxTimestampSeconds?: number
) {
  if (!isSupabaseConfigured()) {
    console.info('Supabase not configured, returning empty embedding matches');
    return [];
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_transcript_embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        target_video_id: videoId,
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: matchCount,
        max_start_seconds: maxTimestampSeconds || 99999,
      }),
    });
    if (!res.ok) throw new Error('RPC pgvector search failed');
    return await res.json();
  } catch (err) {
    console.error('Failed pgvector semantic query:', err);
    return [];
  }
}
