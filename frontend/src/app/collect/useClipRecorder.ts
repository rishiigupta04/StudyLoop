/**
 * One clip = one press of ~ on the Collect page (dev-only, Tier 1c).
 *
 * Deliberately the same audio path as the app: `lib/audioCapture` records while the key is held and
 * `POST /api/stt` transcribes it, so the text in the corpus is the text the classifier will see in
 * production. The browser recognizer runs alongside for the `browser_text` comparison column.
 *
 * Speed rule: the card advances on key-up, before the clip is stored and long before the hosted
 * transcript lands. A speaker doing 75 clips must never wait on the network.
 */

import { useCallback, useRef, useState } from 'react';
import { abortCapture, captureSupported, startCapture, stopCapture } from '@/lib/audioCapture';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import type { AsrLang } from '@/hooks/useSpeechRecognition';
import { scenarioText, type Card } from '@/lib/collectScenarios';
import { patchClip, putClip, type ClipRecord, type SessionRecord } from '@/lib/collectStore';
import { hostedSttAvailable, transcribeAudio } from '@/services/speechService';

/** Shorter than this is a slip of the key, not speech. */
export const MIN_CLIP_MS = 350;

interface Options {
  session: SessionRecord;
  /** monotonic clip number within the session (clip_id and the audio filename use it) */
  nextSeq: () => number;
  isLecturePlaying: () => boolean;
  duck: () => void;
  unduck: () => void;
  onStored: (clip: ClipRecord) => void;
  onUpdated: (clip: ClipRecord) => void;
  onDiscarded: (reason: string) => void;
}

export interface ClipRecorder {
  recording: boolean;
  /** ms since the key went down, for the on-screen timer */
  startedAt: number;
  asrSupported: boolean;
  asrError: string | null;
  interim: string;
  begin: (card: Card) => void;
  /** finish the clip; resolves once it is stored (the caller advances the card immediately) */
  finish: (card: Card, queueIndex: number) => Promise<void>;
  cancel: () => void;
}

const asrLangFor = (style: string): AsrLang => (style === 'hi' ? 'hi-IN' : 'en-IN');
const sttLangFor = (style: string): 'en' | 'hi' => (style === 'hi' ? 'hi' : 'en');

export function useClipRecorder(opts: Options): ClipRecorder {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const asr = useSpeechRecognition();
  const asrRef = useRef(asr);
  asrRef.current = asr; // the hook returns a fresh object each render; its methods are stable
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const activeRef = useRef(false);
  // the previous clip's browser transcript may still be resolving; starting a new recognizer before
  // it does would blank it out, so ASR (not the audio) waits for it
  const pendingBrowserText = useRef<Promise<unknown>>(Promise.resolve());

  const begin = useCallback((card: Card) => {
    if (activeRef.current) return;
    activeRef.current = true;
    setRecording(true);
    setStartedAt(performance.now());
    optsRef.current.duck();
    if (captureSupported()) void startCapture();
    const lang = asrLangFor(card.style);
    void pendingBrowserText.current.then(() => {
      if (activeRef.current) asrRef.current.start(lang);
    });
  }, []);

  const finish = useCallback(
    async (card: Card, queueIndex: number) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      setRecording(false);
      const { session, nextSeq, isLecturePlaying, unduck, onStored, onUpdated, onDiscarded } = optsRef.current;
      unduck();

      const browserTextPromise = asrRef.current.supported ? asrRef.current.stop() : Promise.resolve('');
      pendingBrowserText.current = browserTextPromise;
      const capture = await stopCapture();
      if (!capture || capture.durationMs < MIN_CLIP_MS) {
        abortCapture();
        // browserTextPromise is left to settle on its own: nothing stores it, but the next `begin`
        // still waits on it before opening a new recognizer
        onDiscarded(capture ? 'Too short' : 'No audio captured');
        return;
      }

      const seq = nextSeq();
      const clip: ClipRecord = {
        clip_id: `${session.session_id}_${String(seq).padStart(3, '0')}`,
        session_id: session.session_id,
        speaker_id: session.speaker_id,
        recorded_at: new Date().toISOString(),
        scenario_id: card.scenario.id,
        scenario: scenarioText(card.scenario, card.style),
        intended_intent: card.intent,
        lang_style: card.style,
        queue_index: queueIndex,
        mic: session.mic,
        noise: session.noise,
        lecture_playing: isLecturePlaying(),
        duration_ms: capture.durationMs,
        audio: capture.blob,
        audio_type: capture.blob.type || 'audio/webm',
        browser_text: '',
        stt_text: '',
        stt_provider: '',
        stt_ms: null,
        stt_status: hostedSttAvailable() ? 'pending' : 'skipped',
        notes: '',
      };
      await putClip(clip);
      onStored(clip);

      // both transcripts arrive after the speaker has moved on; patch the stored clip in place
      void browserTextPromise.then(async (text) => {
        const updated = await patchClip(clip.clip_id, { browser_text: text.trim() });
        if (updated) onUpdated(updated);
      });

      if (clip.stt_status === 'pending') {
        void (async () => {
          const hosted = await transcribeAudio(capture.blob, sttLangFor(card.style));
          const patch: Partial<ClipRecord> = hosted
            ? {
                stt_text: hosted.text.trim(),
                stt_provider: hosted.provider,
                stt_ms: Math.round(hosted.ms),
                stt_status: 'done',
              }
            : { stt_status: hostedSttAvailable() ? 'failed' : 'skipped' };
          const updated = await patchClip(clip.clip_id, patch);
          if (updated) onUpdated(updated);
        })();
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setRecording(false);
    abortCapture();
    asrRef.current.abort();
    optsRef.current.unduck();
  }, []);

  return {
    recording,
    startedAt,
    asrSupported: asr.supported,
    asrError: asr.error,
    interim: asr.interim,
    begin,
    finish,
    cancel,
  };
}
