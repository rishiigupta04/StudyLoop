/**
 * The video the learner last started playing on the study page, so "Study" in the sidebar / mobile nav
 * reopens it instead of an empty study page. Per browser (localStorage); every access is guarded because
 * storage can be blocked (private mode) and the app must work without it.
 */

const KEY = 'studyloop.lastVideo';
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export function setLastVideo(videoId: string): void {
  if (!VIDEO_ID.test(videoId)) return;
  try {
    localStorage.setItem(KEY, videoId);
  } catch {
    /* private mode: Study falls back to the library */
  }
}

export function getLastVideo(): string | null {
  try {
    const id = localStorage.getItem(KEY);
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Where the "Study" nav link goes: the last-watched video, or the library when there is none yet. */
export function studyHref(): string {
  const id = getLastVideo();
  return id ? `/video-study-page?v=${encodeURIComponent(id)}` : '/library';
}
