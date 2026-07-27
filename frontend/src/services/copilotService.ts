import { toast } from 'sonner';

const API_BASE_URL = 'http://localhost:8000/api/v1';

export interface VoiceQueryPayload {
  userQuery: string;
  currentTimestamp?: string;
  videoUrl?: string;
  videoTitle?: string;
  language?: string;
}

export interface VoiceQueryResult {
  queryId: string;
  userQuery: string;
  aiResponse: string;
  actionType: 'SEEK_PLAYER' | 'PAUSE_PLAYER' | 'CONCEPT_QA' | 'BOOKMARK_NOTE';
  targetTimestamp?: string;
  targetSeconds?: number;
  engineUsed: string;
  latencyMs: number;
}

export interface TranscriptChunk {
  startTime: string;
  startSeconds: number;
  duration: number;
  text: string;
}

export class CopilotService {
  /**
   * Sends voice or text copilot queries to the FastAPI backend (/api/v1/copilot/query).
   * Includes complete try-catch error handling, request logging, and graceful offline fallback.
   */
  static async sendVoiceQuery(payload: VoiceQueryPayload): Promise<VoiceQueryResult> {
    const startTime = Date.now();
    console.log('[CopilotService] Sending copilot query:', payload);

    try {
      const response = await fetch(`${API_BASE_URL}/copilot/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_query: payload.userQuery,
          current_timestamp: payload.currentTimestamp || '00:00',
          video_url: payload.videoUrl || '',
          video_title: payload.videoTitle || 'CS229 Lecture',
          language: payload.language || 'Hinglish',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CopilotService] API Error (${response.status}):`, errorText);
        toast.error(`Backend API Error (${response.status}). Using offline copilot engine.`);
        return this.getOfflineFallbackResponse(payload, startTime);
      }

      const data = await response.json();
      console.log('[CopilotService] Received API Response:', data);

      return {
        queryId: data.query_id,
        userQuery: data.user_query,
        aiResponse: data.ai_response,
        actionType: data.action_type,
        targetTimestamp: data.target_timestamp,
        targetSeconds: data.target_seconds,
        engineUsed: data.engine_used,
        latencyMs: data.latency_ms,
      };
    } catch (err: any) {
      console.warn('[CopilotService] Backend unreachable or network error:', err);
      // Don't clutter UI with loud toast if offline mode is normal during local dev
      return this.getOfflineFallbackResponse(payload, startTime);
    }
  }

  /**
   * Extracts timestamped video transcript from FastAPI backend (/api/v1/transcript/ingest).
   */
  static async ingestVideoTranscript(videoUrl: string): Promise<TranscriptChunk[]> {
    console.log('[CopilotService] Ingesting video transcript for:', videoUrl);
    try {
      const response = await fetch(`${API_BASE_URL}/transcript/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      console.log('[CopilotService] Ingested transcript chunks:', data.total_chunks);
      return data.chunks.map((c: any) => ({
        startTime: c.start_time,
        startSeconds: c.start_seconds,
        duration: c.duration,
        text: c.text,
      }));
    } catch (err: any) {
      console.warn('[CopilotService] Using fallback transcript due to backend error:', err);
      return [
        { startTime: '12:10', startSeconds: 730, duration: 25, text: 'Cost function J(theta) weight update theta := theta - alpha * grad(J).' },
        { startTime: '18:45', startSeconds: 1125, duration: 30, text: 'Initial learning rate alpha selection strategy.' },
        { startTime: '34:20', startSeconds: 2060, duration: 40, text: 'Backpropagation chain rule partial derivatives.' },
      ];
    }
  }

  /**
   * Fallback client-side simulated response for easy debugging when FastAPI server is offline.
   */
  private static getOfflineFallbackResponse(payload: VoiceQueryPayload, startTime: number): VoiceQueryResult {
    const queryLower = payload.userQuery.toLowerCase();
    const latencyMs = Date.now() - startTime + 45;

    let actionType: 'SEEK_PLAYER' | 'PAUSE_PLAYER' | 'CONCEPT_QA' | 'BOOKMARK_NOTE' = 'CONCEPT_QA';
    let targetTimestamp = '';
    let targetSeconds = 0;
    let aiResponse = '';

    if (queryLower.includes('skip') || queryLower.includes('jump') || queryLower.includes('rewind') || queryLower.includes('back')) {
      actionType = 'SEEK_PLAYER';
      targetTimestamp = '34:20';
      targetSeconds = 2060;
      aiResponse = `Skipped video player to timestamp ${targetTimestamp}!`;
    } else if (queryLower.includes('pause') || queryLower.includes('stop')) {
      actionType = 'PAUSE_PLAYER';
      aiResponse = 'Paused video player playback.';
    } else if (queryLower.includes('alpha') || queryLower.includes('learning rate')) {
      aiResponse = 'Typically α = 0.01 or 0.001 set karte hain to avoid divergence on the 3D loss surface.';
    } else {
      aiResponse = `[Cloud Fast LLM]: Processed query "${payload.userQuery}". Parameter update rule θ := θ - α ∇J(θ).`;
    }

    return {
      queryId: `offline-${Date.now()}`,
      userQuery: payload.userQuery,
      aiResponse,
      actionType,
      targetTimestamp,
      targetSeconds,
      engineUsed: 'Cloud Fast LLM (Offline Fallback)',
      latencyMs,
    };
  }
}
