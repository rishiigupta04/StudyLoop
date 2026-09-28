/**
 * Feature flags. Quiz and gamification (XP, levels, streaks) have no backend yet — they come back in
 * Tier 3 — so they stay hidden unless `VITE_DEMO_PREVIEW=true` (roadmap §0: keep the demo honest).
 */
export const DEMO_PREVIEW = import.meta.env.VITE_DEMO_PREVIEW === 'true';

/**
 * The Tier 1c Collect page (`/collect`), a recording tool for the classifier's real-speech data.
 * Its own flag, not DEMO_PREVIEW: it is dev-only rather than "unfinished product surface", and it
 * must stay out of every normal build — the route and its chunk only exist when this is true.
 */
export const COLLECT = import.meta.env.VITE_COLLECT === 'true';
