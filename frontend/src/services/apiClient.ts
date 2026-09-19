/**
 * Thin client for the StudyLoop FastAPI backend.
 * The browser never talks to TranscriptAPI / Groq / Gemini / HF directly — those keys live
 * server-side only (roadmap D1). The only VITE_ vars allowed are public ones.
 */

export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter = async () => null;

/** Set once by AuthProvider: returns the current Supabase access token (refreshed by supabase-js). */
export function setAccessTokenGetter(fn: TokenGetter): void {
  tokenGetter = fn;
}

/** The signed-in user's access token, or null — used for REST and the WebSocket `hello`. */
export function getAccessToken(): Promise<string | null> {
  return tokenGetter().catch(() => null);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiGet<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Fire-and-forget ping so a sleeping free-tier backend starts waking up while the user is still
 * on the landing page (roadmap D11). Never throws.
 */
export function warmUpBackend(): void {
  fetch(`${API_URL}/health`, { method: 'GET', mode: 'cors' }).catch(() => undefined);
}
