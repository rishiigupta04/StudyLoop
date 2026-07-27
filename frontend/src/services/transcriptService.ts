/**
 * TranscriptAPI Service for StudyLoop Web
 * Official API Base URL: https://transcriptapi.com/api/v2
 */

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
  timestamp: string; // Formatted HH:MM:SS or MM:SS
}

export interface VideoMetadata {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

export interface TranscriptResponse {
  video_id: string;
  language: string;
  transcript: TranscriptSegment[];
  metadata?: VideoMetadata;
  length_seconds?: number;
  lengthText?: string;
  isHinglish?: boolean;
}

const TRANSCRIPT_API_BASE_URL = 'https://transcriptapi.com/api/v2';

/**
 * Helper to extract YouTube Video ID from any URL format
 */
export function extractYouTubeId(urlOrId: string): string {
  if (!urlOrId) return 'dQw4w9WgXcQ';
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : trimmed;
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
export function formatSecondsToTimestamp(totalSecs: number): string {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = Math.floor(totalSecs % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

/**
 * Fallback Mock Data for Offline / Demo Mode
 */
const MOCK_DEMO_TRANSCRIPT: TranscriptResponse = {
  video_id: 'dQw4w9WgXcQ',
  language: 'en',
  length_seconds: 4800,
  lengthText: '1:20:00',
  metadata: {
    title: 'MIT 6.006 Introduction to Algorithms — Lecture 1',
    author_name: 'MIT OpenCourseWare',
    author_url: 'https://www.youtube.com/@mitocw',
    thumbnail_url: 'https://img.rocket.new/generatedImages/rocket_gen_img_1f91741a0-1779812637968.png',
  },
  transcript: [
    { start: 0, duration: 272, text: 'Welcome to 6.006, Introduction to Algorithms. My name is Erik Demaine and this is my co-lecturer, Jason Ku.', timestamp: '0:00' },
    { start: 272, duration: 463, text: "This course is about how to solve computational problems and how to communicate that you've solved them correctly and efficiently.", timestamp: '4:32' },
    { start: 735, duration: 715, text: 'An algorithm is a computational procedure for solving a problem. What makes a good algorithm? Correctness, efficiency, and clarity.', timestamp: '12:15' },
    { start: 1450, duration: 875, text: "Let's talk about peak finding. A peak in a 1D array is an element greater than or equal to its neighbors. Every non-empty array has at least one peak.", timestamp: '24:10' },
    { start: 2325, duration: 825, text: 'For a 2D peak, we need a different approach. The greedy ascent algorithm walks uphill from any starting point but can be O(n²) in the worst case.', timestamp: '38:45' },
    { start: 3150, duration: 950, text: 'Time complexity: we analyze algorithms by counting operations as a function of input size n. Asymptotic notation captures the dominant term.', timestamp: '52:30' },
    { start: 4100, duration: 700, text: 'To summarize: peak finding demonstrates the difference between O(n) naive scan, O(log n) divide and conquer for 1D, and O(n log n) for 2D.', timestamp: '1:08:20' },
  ],
};

/**
 * Fetch video metadata & available languages (Free Endpoint)
 */
export async function fetchVideoInfo(videoUrl: string, apiKey?: string) {
  const key = apiKey || import.meta.env.VITE_TRANSCRIPT_API_KEY;
  if (!key) {
    return {
      video_id: extractYouTubeId(videoUrl),
      available_languages: [{ code: 'en', name: 'English' }],
    };
  }

  try {
    const videoId = extractYouTubeId(videoUrl);
    const res = await fetch(`${TRANSCRIPT_API_BASE_URL}/youtube/info?video_url=${encodeURIComponent(videoId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) {
      throw new Error(`TranscriptAPI Info returned HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn('TranscriptAPI info fetch failed, falling back to basic info:', err);
    return {
      video_id: extractYouTubeId(videoUrl),
      available_languages: [{ code: 'en', name: 'English' }],
    };
  }
}

/**
 * Fetch Video Transcript via TranscriptAPI
 * Supports Hindi/Hinglish priority matching (hi, asr-hi, en, asr-en)
 */
export async function fetchVideoTranscript(
  videoUrl: string,
  apiKey?: string
): Promise<TranscriptResponse> {
  const key = apiKey || import.meta.env.VITE_TRANSCRIPT_API_KEY;

  if (!key) {
    console.info('No VITE_TRANSCRIPT_API_KEY set. Operating in high-quality Mock / Demo mode.');
    return MOCK_DEMO_TRANSCRIPT;
  }

  try {
    const videoId = extractYouTubeId(videoUrl);

    // Language Priority: Try Hindi/Hinglish creator captions first, then auto-generated Hindi (asr-hi), then English
    const languagePriority = 'hi,asr-hi,en,asr-en';

    const url = `${TRANSCRIPT_API_BASE_URL}/youtube/transcript?video_url=${encodeURIComponent(videoId)}&language=${languagePriority}&send_metadata=true&include_timestamp=true&format=json`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) {
      throw new Error(`TranscriptAPI error: ${res.statusText} (${res.status})`);
    }

    const data = await res.json();

    const isHindiOrHinglish = data.language?.includes('hi') || data.language?.includes('asr-hi');

    const formattedTranscript: TranscriptSegment[] = (data.transcript || []).map((seg: any) => ({
      text: seg.text,
      start: seg.start,
      duration: seg.duration,
      timestamp: formatSecondsToTimestamp(seg.start),
    }));

    return {
      video_id: data.video_id || videoId,
      language: data.language || 'en',
      isHinglish: isHindiOrHinglish,
      transcript: formattedTranscript,
      metadata: data.metadata,
      length_seconds: data.length_seconds,
      lengthText: data.lengthText,
    };
  } catch (error) {
    console.error('Failed to fetch transcript from TranscriptAPI, using fallback:', error);
    return MOCK_DEMO_TRANSCRIPT;
  }
}
