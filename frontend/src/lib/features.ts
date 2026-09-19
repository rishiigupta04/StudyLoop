/**
 * Feature flags. Quiz and gamification (XP, levels, streaks) have no backend yet — they come back in
 * Tier 3 — so they stay hidden unless `VITE_DEMO_PREVIEW=true` (roadmap §0: keep the demo honest).
 */
export const DEMO_PREVIEW = import.meta.env.VITE_DEMO_PREVIEW === 'true';
