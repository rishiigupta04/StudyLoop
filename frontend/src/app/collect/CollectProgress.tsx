/**
 * What the operator watches instead of the clip list: per-intent counts against the target, the
 * language mix (the data plan wants a third each), and whether the §4 confusable pairs have been
 * hit in all three styles. Dev-only.
 */

import React, { useMemo } from 'react';
import { INTENTS, LANG_STYLES, PAIRS, SCENARIOS, type LangStyle } from '@/lib/collectScenarios';
import type { ClipRecord } from '@/lib/collectStore';

const PAIRS_BY_SCENARIO = new Map(SCENARIOS.map((s) => [s.id, s.pairs]));
const STYLE_TAG: Record<LangStyle, string> = { en: 'EN', hinglish: 'HI-EN', hi: 'हि' };

interface Props {
  clips: ClipRecord[];
  perIntent: number;
}

export default function CollectProgress({ clips, perIntent }: Props) {
  const stats = useMemo(() => {
    const byIntent = new Map<string, number>();
    const byStyle = new Map<LangStyle, number>();
    const byPair = new Map<string, Set<LangStyle>>();
    for (const clip of clips) {
      byIntent.set(clip.intended_intent, (byIntent.get(clip.intended_intent) || 0) + 1);
      byStyle.set(clip.lang_style, (byStyle.get(clip.lang_style) || 0) + 1);
      for (const pair of PAIRS_BY_SCENARIO.get(clip.scenario_id) || []) {
        if (!byPair.has(pair)) byPair.set(pair, new Set());
        byPair.get(pair)!.add(clip.lang_style);
      }
    }
    return { byIntent, byStyle, byPair };
  }, [clips]);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Per intent <span className="text-slate-500">(target {perIntent})</span>
        </h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {INTENTS.map((intent) => {
            const n = stats.byIntent.get(intent) || 0;
            const done = n >= perIntent;
            return (
              <div
                key={intent}
                className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
                  done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-surface-card/60 text-slate-300'
                }`}
                title={`${intent}: ${n} of ${perIntent}`}
              >
                <span className="truncate font-mono">{intent}</span>
                <span className={done ? 'font-semibold' : 'text-slate-500'}>
                  {n}/{perIntent}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Language mix</h3>
        <div className="flex gap-1.5">
          {LANG_STYLES.map((style) => {
            const n = stats.byStyle.get(style) || 0;
            const pct = clips.length ? Math.round((n / clips.length) * 100) : 0;
            return (
              <div key={style} className="flex-1 rounded-lg border border-white/10 bg-surface-card/60 px-2.5 py-1.5 text-xs">
                <div className="font-mono text-slate-300">{STYLE_TAG[style]}</div>
                <div className="text-slate-500">
                  {n} · {pct}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Confusable pairs <span className="text-slate-500">(§4 — all three styles)</span>
        </h3>
        <div className="space-y-1">
          {Object.entries(PAIRS).map(([id, why]) => {
            const styles = stats.byPair.get(id) || new Set<LangStyle>();
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-surface-card/60 px-2.5 py-1.5 text-xs" title={why}>
                <span className="truncate font-mono text-slate-300">{id}</span>
                <span className="flex shrink-0 gap-1">
                  {LANG_STYLES.map((style) => (
                    <span
                      key={style}
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                        styles.has(style) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-slate-600'
                      }`}
                    >
                      {STYLE_TAG[style]}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
