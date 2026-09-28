/**
 * Start-of-session screen for the dev-only Collect page (Tier 1c): who is speaking, on what mic, in
 * what room — the per-clip metadata of docs/TIER1C_DATA_PLAN.md §3 — plus resume/export for earlier
 * sessions still sitting in IndexedDB.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { buildJsonl, buildZip, downloadBlob, exportBasename } from '@/lib/collectExport';
import { INTENTS } from '@/lib/collectScenarios';
import { deleteSession, listClips, listSessions, putSession, type SessionRecord } from '@/lib/collectStore';

const MICS = ['laptop', 'headset', 'earbuds', 'phone'];
const NOISES = ['quiet', 'room', 'lecture', 'cafe'];
const DEFAULT_VIDEO = 'HtSuA80QTyo'; // MIT 6.006 L1 — the lecture the rest of the app is calibrated on

const field = 'input-field w-full rounded-lg px-3 py-2 text-sm';
const label = 'mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400';

interface Props {
  onStart: (session: SessionRecord) => void;
  onResume: (session: SessionRecord) => void;
}

export default function CollectSetup({ onStart, onResume }: Props) {
  const [speakerId, setSpeakerId] = useState('');
  const [perIntent, setPerIntent] = useState(5);
  const [mic, setMic] = useState(MICS[0]);
  const [noise, setNoise] = useState(NOISES[1]);
  const [videoId, setVideoId] = useState(DEFAULT_VIDEO);
  const [past, setPast] = useState<SessionRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const rows = await listSessions();
    setPast(rows);
    const entries = await Promise.all(rows.map(async (s) => [s.session_id, (await listClips(s.session_id)).length] as const));
    setCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async () => {
    const id = speakerId.trim();
    if (!id) {
      toast.error('A speaker pseudonym is required — never a real name');
      return;
    }
    const session: SessionRecord = {
      session_id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      speaker_id: id,
      started_at: new Date().toISOString(),
      clips_per_intent: perIntent,
      cursor: 0,
      mic,
      noise,
      video_id: videoId.trim() || DEFAULT_VIDEO,
    };
    await putSession(session);
    onStart(session);
  };

  const exportPast = async (session: SessionRecord, kind: 'zip' | 'jsonl') => {
    const clips = await listClips(session.session_id);
    if (!clips.length) {
      toast.error('That session has no clips');
      return;
    }
    const base = exportBasename(session.speaker_id, session.started_at);
    if (kind === 'jsonl') {
      downloadBlob(new Blob([buildJsonl(clips)], { type: 'application/x-ndjson;charset=utf-8' }), `${base}.jsonl`);
    } else {
      downloadBlob(await buildZip(clips), `${base}.zip`);
    }
  };

  const drop = async (session: SessionRecord) => {
    if (!window.confirm(`Delete ${session.speaker_id}'s session and its ${counts[session.session_id] ?? 0} clips? Export first.`)) return;
    await deleteSession(session.session_id);
    await refresh();
  };

  return (
    <div className="min-h-screen bg-obsidian px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <span className="rounded-md bg-amber-500/15 px-2 py-1 font-mono text-xs font-semibold text-amber-300">DEV · COLLECT</span>
          <h1 className="mt-3 text-2xl font-semibold">Tier 1c recording session</h1>
          <p className="mt-2 text-sm text-slate-400">
            {INTENTS.length} buckets × {perIntent} clips = <strong className="text-slate-200">{INTENTS.length * perIntent} cards</strong>, about{' '}
            {Math.round(INTENTS.length * perIntent * 0.17)} minutes. Each card is a situation — the speaker says it their own way, never reads a command.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-surface-card/70 p-6">
          <div>
            <label className={label} htmlFor="speaker">
              Speaker pseudonym
            </label>
            <input
              id="speaker"
              className={field}
              value={speakerId}
              onChange={(e) => setSpeakerId(e.target.value)}
              placeholder="spk-04"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-500">A pseudonym, not a real name. Test speakers must never appear in train/validation.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="per-intent">
                Clips per intent
              </label>
              <select id="per-intent" className={field} value={perIntent} onChange={(e) => setPerIntent(Number(e.target.value))}>
                <option value={3}>3 — a quick pass</option>
                <option value={5}>5 — CO4 minimum</option>
                <option value={8}>8 — target</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="mic">
                Mic
              </label>
              <select id="mic" className={field} value={mic} onChange={(e) => setMic(e.target.value)}>
                {MICS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="noise">
                Room
              </label>
              <select id="noise" className={field} value={noise} onChange={(e) => setNoise(e.target.value)}>
                {NOISES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="video">
              Background lecture (YouTube id)
            </label>
            <input id="video" className={field} value={videoId} onChange={(e) => setVideoId(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Play it during the session: the app ducks it to 15% while ~ is held, which is the condition to record in.</p>
          </div>

          <button onClick={start} className="btn-orange w-full rounded-xl px-4 py-3 text-sm font-semibold text-white">
            Start session
          </button>

          <p className="text-xs text-slate-500">
            Written consent to record voice for the course project before you start. Audio goes to the private Drive folder — only transcripts and labels ever
            reach git.
          </p>
        </section>

        {past.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sessions on this machine</h2>
            {past.map((s) => (
              <div key={s.session_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-surface-card/50 px-3 py-2 text-xs">
                <span className="font-medium text-slate-200">{s.speaker_id}</span>
                <span className="font-mono text-slate-600">{s.session_id}</span>
                <span className="text-slate-500">{new Date(s.started_at).toLocaleString()}</span>
                <span className="text-slate-400">{counts[s.session_id] ?? 0} clips</span>
                <div className="ml-auto flex gap-1.5">
                  <button onClick={() => onResume(s)} className="rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/5">
                    Resume
                  </button>
                  <button onClick={() => exportPast(s, 'jsonl')} className="rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/5">
                    JSONL
                  </button>
                  <button onClick={() => exportPast(s, 'zip')} className="rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/5">
                    ZIP
                  </button>
                  <button onClick={() => drop(s)} className="rounded border border-red-500/30 px-2 py-1 text-red-400 hover:bg-red-500/10">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
