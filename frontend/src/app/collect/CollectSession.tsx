/**
 * The recording screen of the dev-only Collect page (Tier 1c).
 *
 * One card at a time, keyboard only: hold ~ to record, → to skip, ⌫ to re-record the last clip.
 * The card advances the instant the key comes up — storing the clip and both transcripts happen
 * behind the speaker, so 70–110 clips fit in ~20 minutes (docs/TIER1C_DATA_PLAN.md §5).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { buildJsonl, buildZip, downloadBlob, exportBasename } from '@/lib/collectExport';
import { buildQueue, LANG_LABEL, scenarioText, type Card, type LangStyle } from '@/lib/collectScenarios';
import { deleteClip, listClips, putSession, storageIsMemoryOnly, type ClipRecord, type SessionRecord } from '@/lib/collectStore';
import { useYouTubePlayer } from '@/hooks/useYouTubePlayer';
import CollectProgress from './CollectProgress';
import { useClipRecorder } from './useClipRecorder';

const HINT: Record<LangStyle, string> = {
  en: 'Say it the way you actually would. Hold ~ while you speak.',
  hinglish: 'Jaise aap sach mein bolte ho waise hi boliye. ~ dabaye rakhiye aur boliye.',
  hi: 'जैसे आप सचमुच कहेंगे वैसे ही कहिए। ~ दबाए रखिए और बोलिए।',
};

const STYLE_TAG: Record<LangStyle, string> = { en: 'EN', hinglish: 'HI-EN', hi: 'हि' };
const OTHER_STYLES: LangStyle[] = ['en', 'hinglish', 'hi'];

const isTypingTarget = (el: Element | null) => {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.getAttribute('contenteditable') === 'true';
};

interface Props {
  session: SessionRecord;
  onExit: () => void;
}

export default function CollectSession({ session, onExit }: Props) {
  const queue = useMemo(
    () => buildQueue({ clipsPerIntent: session.clips_per_intent, seed: session.session_id }),
    [session.clips_per_intent, session.session_id]
  );
  const [index, setIndex] = useState(session.cursor);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [operatorView, setOperatorView] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const indexRef = useRef(index);
  indexRef.current = index;
  const seqRef = useRef(0);
  const playingRef = useRef(false);

  const playerHost = useRef<HTMLDivElement>(null);
  const player = useYouTubePlayer(playerHost, session.video_id);
  playingRef.current = player.isPlaying;

  const card: Card | undefined = queue[index];
  const finished = index >= queue.length;

  // ---------------------------------------------------------------- load / persist
  useEffect(() => {
    let live = true;
    void listClips(session.session_id).then((rows) => {
      if (!live) return;
      setClips(rows);
      seqRef.current = rows.reduce((max, c) => Math.max(max, Number(c.clip_id.split('_').pop()) || 0), 0);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [session.session_id]);

  const moveTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, queue.length));
      setIndex(clamped);
      void putSession({ ...session, cursor: clamped });
    },
    [queue.length, session]
  );

  // ---------------------------------------------------------------- recording
  const recorder = useClipRecorder({
    session,
    nextSeq: () => ++seqRef.current,
    isLecturePlaying: () => playingRef.current,
    duck: player.duck,
    unduck: player.unduck,
    onStored: (clip) => setClips((prev) => [...prev, clip]),
    onUpdated: (clip) => setClips((prev) => prev.map((c) => (c.clip_id === clip.clip_id ? clip : c))),
    onDiscarded: (reason) => {
      toast.error(`${reason} — card re-queued`);
      moveTo(indexRef.current - 1);
    },
  });

  useEffect(() => {
    if (!recorder.recording) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => setElapsed(performance.now() - recorder.startedAt), 100);
    return () => window.clearInterval(id);
  }, [recorder.recording, recorder.startedAt]);

  const reRecordLast = useCallback(async () => {
    const last = clips[clips.length - 1];
    if (!last) {
      toast.error('No clip to re-record');
      return;
    }
    await deleteClip(last.clip_id);
    setClips((prev) => prev.filter((c) => c.clip_id !== last.clip_id));
    moveTo(last.queue_index);
    toast(`Dropped ${last.clip_id} — say it again`);
  }, [clips, moveTo]);

  // ---------------------------------------------------------------- keyboard (the whole flow)
  // Everything the handlers touch goes through this ref: the listeners are registered once, so a
  // re-render mid-press (which happens on every `setRecording`) can't lose the held-key state.
  const liveRef = useRef({ queue, recorder, moveTo, reRecordLast, player });
  liveRef.current = { queue, recorder, moveTo, reRecordLast, player };
  const heldRef = useRef(false);

  useEffect(() => {
    if (!ready) return;

    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      const live = liveRef.current;
      const at = indexRef.current;
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        e.preventDefault();
        if (heldRef.current || e.repeat || at >= live.queue.length) return;
        heldRef.current = true;
        live.recorder.begin(live.queue[at]);
        return;
      }
      if (heldRef.current) return; // no navigation mid-clip
      if (e.code === 'ArrowRight' || e.code === 'Enter') {
        e.preventDefault();
        live.moveTo(at + 1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        live.moveTo(at - 1);
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        void live.reRecordLast();
      } else if (e.code === 'KeyT') {
        setOperatorView((v) => !v);
      } else if (e.code === 'KeyL') {
        if (live.player.isPlaying) live.player.pause();
        else live.player.play();
      }
    };

    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote' && e.key !== '~' && e.key !== '`') return;
      e.preventDefault();
      if (!heldRef.current) return;
      heldRef.current = false;
      const live = liveRef.current;
      const at = indexRef.current;
      const shown = live.queue[at];
      if (!shown) return;
      live.moveTo(at + 1); // advance first: the speaker never waits on storage or STT
      void live.recorder.finish(shown, at);
    };

    // clicking the lecture iframe moves focus into it and ~ would stop reaching us
    const blurIframe = () => {
      window.setTimeout(() => {
        const el = document.activeElement;
        if (el?.tagName === 'IFRAME') {
          (el as HTMLIFrameElement).blur();
          window.focus();
        }
      }, 0);
    };

    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blurIframe);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blurIframe);
    };
  }, [ready]);

  useEffect(() => () => liveRef.current.recorder.cancel(), []);

  // ---------------------------------------------------------------- export
  const pending = clips.filter((c) => c.stt_status === 'pending').length;
  const sttDone = clips.filter((c) => c.stt_status === 'done').length;
  const base = exportBasename(session.speaker_id, session.started_at);
  const recent = clips.slice(-6).reverse();

  const exportZip = async () => {
    if (!clips.length) {
      toast.error('Nothing recorded yet');
      return;
    }
    setBusy('Building ZIP…');
    try {
      downloadBlob(await buildZip(clips), `${base}.zip`);
      toast.success(`${clips.length} clips + labels.jsonl`);
    } finally {
      setBusy(null);
    }
  };

  const exportJsonl = () => {
    if (!clips.length) {
      toast.error('Nothing recorded yet');
      return;
    }
    downloadBlob(new Blob([buildJsonl(clips)], { type: 'application/x-ndjson;charset=utf-8' }), `${base}.jsonl`);
  };

  return (
    <div className="min-h-screen bg-obsidian text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-obsidian/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="rounded-md bg-amber-500/15 px-2 py-1 font-mono text-xs font-semibold text-amber-300">DEV · COLLECT</span>
          <span className="text-sm text-slate-300">
            {session.speaker_id} <span className="text-slate-600">·</span>{' '}
            <span className="font-mono text-xs text-slate-500">{session.session_id}</span>
          </span>
          <span className="text-sm text-slate-400">
            <strong className="text-slate-100">{clips.length}</strong> clips · {sttDone} transcribed
            {pending > 0 && <span className="text-amber-400"> · {pending} in flight</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportJsonl} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5">
              Export JSONL
            </button>
            <button onClick={exportZip} disabled={!!busy} className="btn-orange rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy || 'Export ZIP'}
            </button>
            <button onClick={onExit} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5">
              End
            </button>
          </div>
        </div>
        <div className="h-0.5 w-full bg-white/5">
          <div
            className="h-0.5 bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all"
            style={{ width: `${queue.length ? (index / queue.length) * 100 : 0}%` }}
          />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {storageIsMemoryOnly() && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              IndexedDB is unavailable — clips live in this tab only. Export before closing it.
            </p>
          )}
          {!recorder.asrSupported && (
            <p className="rounded-lg border border-white/10 bg-surface-card/60 px-3 py-2 text-xs text-slate-400">
              No browser recognizer here (Chrome or Edge has one). Audio and the hosted transcript are still recorded; browser_text stays empty.
            </p>
          )}
          {recorder.asrError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{recorder.asrError}</p>}

          {/* ── the card ── */}
          {finished ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center">
              <Icon name="CheckCircle2" size={40} className="mx-auto mb-3 text-emerald-400" />
              <h2 className="text-xl font-semibold">Queue finished — {clips.length} clips</h2>
              <p className="mt-2 text-sm text-slate-400">Export the ZIP (audio + labels) and the JSONL. Audio goes to the private Drive folder, never to git.</p>
              <button onClick={() => moveTo(index - 1)} className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                ← Back to the last card
              </button>
            </div>
          ) : (
            card && (
              <div
                className={`rounded-2xl border p-8 transition-colors ${
                  recorder.recording ? 'border-red-500/60 bg-red-500/5' : 'border-white/10 bg-surface-card/70'
                }`}
              >
                <div className="mb-5 flex items-center gap-3 text-xs">
                  <span className="rounded-md bg-indigo-500/20 px-2 py-1 font-mono font-semibold text-indigo-300">{STYLE_TAG[card.style]}</span>
                  <span className="text-slate-500">{LANG_LABEL[card.style]}</span>
                  {operatorView && <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-slate-400">{card.intent}</span>}
                  <span className="ml-auto font-mono text-slate-500">
                    {index + 1} / {queue.length}
                  </span>
                </div>

                <p className="text-2xl leading-relaxed text-slate-50 sm:text-3xl sm:leading-relaxed">{scenarioText(card.scenario, card.style)}</p>
                <p className="mt-4 text-sm text-slate-500">{HINT[card.style]}</p>

                {operatorView && (
                  <div className="mt-5 space-y-1 border-t border-white/10 pt-4 text-xs text-slate-500">
                    <div className="font-mono text-slate-600">{card.scenario.id}</div>
                    {OTHER_STYLES.filter((s) => s !== card.style).map((s) => (
                      <div key={s}>
                        <span className="font-mono text-slate-600">{STYLE_TAG[s]}</span> {card.scenario[s]}
                      </div>
                    ))}
                    {card.scenario.pairs.length > 0 && <div className="font-mono text-amber-500/70">pairs: {card.scenario.pairs.join(', ')}</div>}
                  </div>
                )}

                <div className="mt-6 flex items-center gap-3">
                  {recorder.recording ? (
                    <>
                      <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                      <span className="font-mono text-sm text-red-300">recording {(elapsed / 1000).toFixed(1)}s</span>
                      <span className="truncate text-sm text-slate-500">{recorder.interim}</span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-600">
                      Hold <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-slate-300">~</kbd> to record
                    </span>
                  )}
                </div>
              </div>
            )
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              <kbd className="font-mono text-slate-400">~</kbd> hold to record
            </span>
            <span>
              <kbd className="font-mono text-slate-400">→ / Enter</kbd> skip
            </span>
            <span>
              <kbd className="font-mono text-slate-400">←</kbd> back
            </span>
            <span>
              <kbd className="font-mono text-slate-400">⌫</kbd> re-record last
            </span>
            <span>
              <kbd className="font-mono text-slate-400">T</kbd> operator view
            </span>
            <span>
              <kbd className="font-mono text-slate-400">L</kbd> lecture play/pause
            </span>
          </div>

          {/* ── what landed ── */}
          <div className="space-y-2">
            {recent.map((clip) => (
              <div key={clip.clip_id} className="rounded-xl border border-white/10 bg-surface-card/50 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-slate-500">{clip.clip_id.split('_').pop()}</span>
                  <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-indigo-300">{clip.intended_intent}</span>
                  <span className="font-mono text-slate-600">{STYLE_TAG[clip.lang_style]}</span>
                  <span className="text-slate-600">{(clip.duration_ms / 1000).toFixed(1)}s</span>
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 font-mono ${
                      clip.stt_status === 'done'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : clip.stt_status === 'pending'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    {clip.stt_status === 'done' ? `${clip.stt_provider} ${clip.stt_ms}ms` : clip.stt_status}
                  </span>
                </div>
                <div className="mt-1 grid gap-0.5 sm:grid-cols-2">
                  <div className="truncate text-slate-400">
                    <span className="text-slate-600">browser:</span> {clip.browser_text || '—'}
                  </div>
                  <div className="truncate text-slate-300">
                    <span className="text-slate-600">{clip.stt_provider || 'stt'}:</span> {clip.stt_text || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── sidebar ── */}
        <aside className="space-y-5">
          <div>
            <div ref={playerHost} className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black" />
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <button
                onClick={() => (player.isPlaying ? player.pause() : player.play())}
                className="shrink-0 rounded border border-white/15 px-2 py-1 text-slate-300 hover:bg-white/5"
              >
                {player.isPlaying ? 'Pause' : 'Play'} lecture
              </button>
              <span>{player.isPlaying ? 'ducks to 15% while ~ is held' : 'real conditions: let it play'}</span>
            </div>
          </div>
          <CollectProgress clips={clips} perIntent={session.clips_per_intent} />
        </aside>
      </main>
    </div>
  );
}
