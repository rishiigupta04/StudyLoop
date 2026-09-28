/**
 * Tier 1c recording deck (dev-only Collect page). The cards live in `collectScenarios.json` so the
 * backend test (`backend/tests/test_collect_scenarios.py`) can check the same file the page shows —
 * it must cover every intent in `orchestration/intents.py` plus the §4 confusable pairs.
 *
 * A card shows a *situation*, never the command, and only in the speaker's assigned language
 * (docs/TIER1C_DATA_PLAN.md §3: reading a written command back inflates accuracy).
 */

import deck from './collectScenarios.json';

export type LangStyle = 'en' | 'hinglish' | 'hi';

export interface Scenario {
  id: string;
  intent: string;
  pairs: string[];
  en: string;
  hinglish: string;
  hi: string;
}

/** One position in a session queue: a scenario shown in one language. */
export interface Card {
  /** stable within a session — the queue index is part of it, so a repeated scenario is a new card */
  key: string;
  scenario: Scenario;
  intent: string;
  style: LangStyle;
}

export const SCENARIOS: Scenario[] = deck.scenarios as Scenario[];
export const PAIRS: Record<string, string> = deck.pairs;
export const PAIR_IDS: string[] = Object.keys(deck.pairs);
export const LANG_STYLES: LangStyle[] = ['en', 'hinglish', 'hi'];

/** Intents in deck order (PLAY … OOS), which is also the order the progress grid uses. */
export const INTENTS: string[] = [...new Set(SCENARIOS.map((s) => s.intent))];

export const LANG_LABEL: Record<LangStyle, string> = { en: 'English', hinglish: 'Hinglish', hi: 'हिंदी' };

export function scenarioText(scenario: Scenario, style: LangStyle): string {
  return scenario[style];
}

// ---------------------------------------------------------------- seeded shuffle
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a session is reproducible from its id, which makes an audit repeatable. */
function rngFrom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface QueueOptions {
  /** clips per intent — 5 is the CO4 minimum per speaker, 8 the target (data plan §2) */
  clipsPerIntent: number;
  /** seed: the session id, so reopening the same session rebuilds the same queue */
  seed: string;
  styles?: LangStyle[];
}

/**
 * A speaker's whole session: `clipsPerIntent` cards for each of the 15 buckets, languages spread
 * evenly within and across intents, then interleaved so two cards in a row rarely share an intent
 * (back-to-back PLAY, PLAY makes people repeat themselves).
 */
export function buildQueue({ clipsPerIntent, seed, styles = LANG_STYLES }: QueueOptions): Card[] {
  const rnd = rngFrom(seed);
  const buckets: Card[][] = [];

  INTENTS.forEach((intent, intentIndex) => {
    const pool = SCENARIOS.filter((s) => s.intent === intent);
    if (!pool.length) return;
    const picks: Scenario[] = [];
    let bag: Scenario[] = [];
    while (picks.length < clipsPerIntent) {
      if (!bag.length) bag = shuffled(pool, rnd); // reshuffle per pass: no repeats until the pool runs out
      picks.push(bag.pop()!);
    }
    buckets.push(
      picks.map((scenario, i) => ({
        key: `${intent}-${i}`,
        scenario,
        intent,
        // offset per intent so the language mix is even overall, not just within one intent
        style: styles[(i + intentIndex) % styles.length],
      }))
    );
  });

  // Greedy interleave: always take from the fullest bucket that isn't the one we just used.
  const queue: Card[] = [];
  let last = '';
  for (;;) {
    const open = buckets.filter((b) => b.length);
    if (!open.length) break;
    const max = Math.max(...open.map((b) => b.length));
    const candidates = open.filter((b) => b.length === max && b[0].intent !== last);
    const bucket = (candidates.length ? candidates : open)[Math.floor(rnd() * (candidates.length || open.length))];
    const card = bucket.shift()!;
    last = card.intent;
    queue.push({ ...card, key: `${card.intent}-${card.scenario.id}-${queue.length}` });
  }
  return queue;
}
