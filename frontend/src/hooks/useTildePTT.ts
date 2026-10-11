import { useState, useEffect, useCallback, useRef } from 'react';
import { executePlayerAction, playerUnavailableMessage, type PlayerControls } from '@/lib/playerActions';
import { createSpeechStream, stopSpeaking, type SpeechStream } from '@/lib/tts';
import {
  abortCapture,
  captureProblem,
  captureSupported,
  micPromptPending,
  startCapture,
  stopCapture,
  type CaptureProblem,
} from '@/lib/audioCapture';
import { hostedSttAvailable, transcribeAudio } from '@/services/speechService';
import type { AsrLang, SpeechRecognitionApi } from './useSpeechRecognition';
import type { Citation, Lang, SendOptions, TurnResult } from './useStudySocket';

export type PTTStage = 'idle' | 'listening' | 'processing' | 'responding';

export interface TurnMeta {
  route: string | null;
  intent: string | null;
  confidence: number | null;
  normalizedText?: string | null;
  serverMs?: number;
  roundTripMs: number;
  isAction: boolean;
  citations?: Citation[];
  /** who turned the speech into text: 'sarvam' | 'groq' (hosted, D14) or 'browser' */
  sttProvider?: string;
  sttMs?: number;
}

export interface SttInfo {
  provider: string;
  ms?: number;
}

interface UseTildePTTOptions {
  language: Lang;
  asr: SpeechRecognitionApi;
  player: PlayerControls & { duck: () => void; unduck: () => void };
  sendUtterance: (text: string, opts?: SendOptions) => Promise<TurnResult>;
  cancelTurn?: () => void;
  onTurn?: (userText: string, reply: string, meta: TurnMeta) => void;
}

const ACTION_AUTOCLOSE_MS = 1600;
const ACTION_FAILED_CLOSE_MS = 4500; // "the player isn't available" needs reading time
const MAX_HOLD_MS = 30_000; // a hold longer than this is a lost key-up (alt-tab, OS dialog): send what we have
const PROMPT_NOTICE_MS = 500; // how long a start may sit on the mic permission prompt before we say so
// The lecture is ducked while ~ is held and while the answer is spoken. Every exit path restores it; these
// watchdogs put the volume back if one is ever missed (a hung TTS request, a turn that never answers).
const DUCK_LISTEN_MS = 60_000;
const DUCK_TURN_MS = 40_000;
const DUCK_SPEAK_MS = 45_000;
/** error codes after which asking the same thing again can work (the user did nothing wrong) */
const RETRYABLE_CODES = ['offline', 'timeout', 'connection_lost'];

const SAY = {
  noSpeech: { en: "Didn't catch anything — hold ~ while you speak.", hi: 'कुछ सुनाई नहीं दिया — ~ दबाकर रखें और बोलें।' },
  allowMic: { en: 'Allow the microphone, then hold ~ again.', hi: 'Microphone की अनुमति दें, फिर ~ दबाकर रखें।' },
  micDenied: {
    en: 'The microphone is blocked. Allow it in the address bar, then hold ~ again.',
    hi: 'Microphone blocked है। Address bar में अनुमति दें, फिर ~ दबाकर रखें।',
  },
  noMic: { en: 'No microphone found. Plug one in, then hold ~ again.', hi: 'Microphone नहीं मिला। कोई microphone लगाएँ, फिर ~ दबाकर रखें।' },
  micBusy: {
    en: 'The microphone is in use by another app. Close it, then hold ~ again.',
    hi: 'Microphone किसी दूसरे app में चल रहा है। उसे बंद करके ~ दबाकर रखें।',
  },
  micError: {
    en: "Couldn't open the microphone. Check the browser's microphone settings.",
    hi: 'Microphone नहीं खुला। Browser की microphone settings देखें।',
  },
  lostFocus: {
    en: 'Stopped listening because the window lost focus. Hold ~ again.',
    hi: 'Window से focus हट गया, इसलिए सुनना बंद हुआ। ~ फिर दबाकर रखें।',
  },
  failed: { en: 'Something went wrong. Please try again.', hi: 'कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।' },
};

/** The plain-words reason the mic gave us nothing, or null when it just heard nothing. */
function micMessage(problem: CaptureProblem | null, promptPending: boolean, lang: Lang): string | null {
  if (promptPending) return SAY.allowMic[lang];
  switch (problem) {
    case 'denied':
      return SAY.micDenied[lang];
    case 'no-mic':
      return SAY.noMic[lang];
    case 'busy':
      return SAY.micBusy[lang];
    case 'error':
      return SAY.micError[lang];
    default:
      return null;
  }
}

/**
 * Push-to-talk: hold ~ (or use the mic button) → browser ASR → text over WebSocket → LangGraph →
 * player action (fast path) or spoken answer. Barge-in: pressing again cancels speech + stale turns.
 */
export function useTildePTT(options: UseTildePTTOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const [stage, setStage] = useState<PTTStage>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [activeStep, setActiveStep] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [meta, setMeta] = useState<TurnMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // mic / focus problems, shown in the modal
  const [canAskAgain, setCanAskAgain] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const holdTimer = useRef<number | undefined>(undefined);
  const promptTimer = useRef<number | undefined>(undefined);
  const duckTimer = useRef<number | undefined>(undefined);
  const turnSeq = useRef(0); // a newer command supersedes an answer still in flight
  const speechRef = useRef<SpeechStream | null>(null);
  const listeningRef = useRef(false); // set synchronously (state lags a render): is a hold in progress?
  const keyDownRef = useRef(false); // is ~ physically down? (a lost key-up must not wedge the next press)
  const captureTriedRef = useRef(false);
  const lastAskRef = useRef<{ text: string; stt?: SttInfo } | null>(null);
  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const armDuckWatchdog = useCallback((ms: number) => {
    window.clearTimeout(duckTimer.current);
    duckTimer.current = window.setTimeout(() => optsRef.current.player.unduck(), ms);
  }, []);

  /** Bring the lecture back to its own volume (every exit path of a turn goes through here). */
  const restoreVolume = useCallback(() => {
    window.clearTimeout(duckTimer.current);
    optsRef.current.player.unduck();
  }, []);

  const startListening = useCallback(() => {
    const { asr, language, player, cancelTurn } = optsRef.current;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(promptTimer.current);
    const seq = ++turnSeq.current;
    speechRef.current?.cancel();
    stopSpeaking(); // barge-in: new command interrupts stale audio
    cancelTurn?.();
    player.duck();
    armDuckWatchdog(DUCK_LISTEN_MS);
    listeningRef.current = true;
    setIsOpen(true);
    setStage('listening');
    setRecognizedText('');
    setAiResponse('');
    setMeta(null);
    setError(null);
    setNotice(null);
    setCanAskAgain(false);
    setActiveStep(0);
    const lang: AsrLang = language === 'hi' ? 'hi-IN' : 'en-IN';
    // hosted STT (D14) records the audio; the browser recognizer still gives live captions while ~ is held
    const hosted = hostedSttAvailable() && captureSupported();
    captureTriedRef.current = hosted;
    if (hosted) {
      void startCapture()
        .then((ok) => {
          if (turnSeq.current !== seq || !listeningRef.current) return;
          if (ok) return setNotice(null); // granted while ~ is still held: recording now
          const why = micMessage(captureProblem(), false, optsRef.current.language);
          if (why) setNotice(why); // denied / no mic: say so now, not after the release
        })
        .catch(() => undefined); // MediaRecorder refused to start: the browser transcript is used
      // the first press ever sits on the browser's permission prompt: tell the learner what to do
      promptTimer.current = window.setTimeout(() => {
        if (turnSeq.current === seq && listeningRef.current && micPromptPending()) setNotice(SAY.allowMic[optsRef.current.language]);
      }, PROMPT_NOTICE_MS);
    }
    if (asr.supported || !hosted) asr.start(lang); // without either, asr.start reports "needs Chrome or Edge"
    holdTimer.current = window.setTimeout(() => {
      if (turnSeq.current !== seq || !listeningRef.current) return;
      keyDownRef.current = false; // the key-up never came: stop waiting for it
      void stopRef.current();
    }, MAX_HOLD_MS);
  }, [armDuckWatchdog]);

  /** Everything after ASR: send the recognized text, execute the action or speak the answer. */
  const processText = useCallback(async (text: string, stt?: SttInfo) => {
    const { player, sendUtterance, onTurn, language } = optsRef.current;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(promptTimer.current);
    listeningRef.current = false;
    setIsOpen(true);
    setStage('processing');
    setAiResponse('');
    setMeta(null);
    setRecognizedText(text);
    setNotice(null);
    setError(null); // a repeat failure with the same message must still raise a fresh toast
    setCanAskAgain(false);
    if (!text) {
      restoreVolume();
      setStage('responding');
      setAiResponse(SAY.noSpeech[language]);
      setActiveStep(-1);
      return;
    }
    lastAskRef.current = { text, stt };
    setActiveStep(1);
    const seq = ++turnSeq.current;
    armDuckWatchdog(DUCK_TURN_MS);
    speechRef.current?.cancel();
    // D8: the lecture stays ducked while the answer is spoken, and comes back once it's done
    const speech = createSpeechStream(language, () => {
      if (turnSeq.current === seq) restoreVolume();
    });
    speechRef.current = speech;
    let streamed = '';
    const { msg, roundTripMs } = await sendUtterance(text, {
      onDelta: (d) => {
        if (turnSeq.current !== seq) return;
        if (!streamed) {
          setStage('responding');
          setActiveStep(3);
          armDuckWatchdog(DUCK_SPEAK_MS);
        }
        streamed += d;
        setAiResponse(streamed);
        speech.push(d);
      },
    });
    if (turnSeq.current !== seq) return; // superseded by a newer command while this one was in flight
    setActiveStep(3);

    if (msg.type === 'error') {
      speech.cancel();
      restoreVolume();
      setError(msg.message);
      // keep what had already streamed: a drop mid-answer shouldn't erase the half that arrived
      setAiResponse(streamed ? `${streamed} … ${msg.message}` : msg.message);
      setCanAskAgain(RETRYABLE_CODES.includes(msg.code));
      setStage('responding');
      return;
    }
    const m: TurnMeta = {
      route: msg.route,
      intent: msg.intent,
      confidence: msg.confidence,
      normalizedText: msg.normalized_text,
      serverMs: msg.timings?.server_total,
      roundTripMs,
      isAction: msg.type === 'action',
      citations: msg.type === 'answer.done' ? msg.citations || [] : [],
      sttProvider: stt?.provider,
      sttMs: stt?.ms,
    };
    setMeta(m);

    if (msg.type === 'action') {
      speech.cancel();
      restoreVolume(); // restore before the action so VOLUME/MUTE actions apply to the real level
      // a blocked / still-loading player can't do it: say so instead of confirming "Paused" / "Jumped to 12:30"
      const done = executePlayerAction(player, msg.action);
      const shown = done ? msg.message : playerUnavailableMessage(language);
      setAiResponse(shown);
      setStage('responding');
      onTurn?.(text, shown, m);
      closeTimer.current = window.setTimeout(
        () => {
          setIsOpen(false);
          setStage('idle');
        },
        done ? ACTION_AUTOCLOSE_MS : ACTION_FAILED_CLOSE_MS
      );
    } else {
      setAiResponse(msg.text);
      setStage('responding');
      onTurn?.(text, msg.text, m);
      if (msg.cancelled) {
        speech.cancel();
        restoreVolume();
        return;
      }
      if (!streamed) speech.push(msg.text); // template answers (no transcript, not covered yet…) don't stream
      armDuckWatchdog(DUCK_SPEAK_MS); // the speech's own idle callback normally restores it sooner
      speech.end();
    }
  }, [armDuckWatchdog, restoreVolume]);

  const stopListeningAndProcess = useCallback(async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(promptTimer.current);
    const seq = turnSeq.current; // a re-press (or close) while we await below makes this result stale
    const { asr, language } = optsRef.current;
    const promptPending = micPromptPending(); // read before stopCapture() cancels the waiting start
    const captureTried = captureTriedRef.current;
    setStage('processing');
    try {
      const [browserText, capture] = await Promise.all([
        asr.supported ? asr.stop() : Promise.resolve(''),
        stopCapture(),
      ]);
      if (turnSeq.current !== seq) return;
      setRecognizedText(browserText); // shown while the hosted transcript is on its way
      if (capture && capture.durationMs > 250) {
        const hosted = await transcribeAudio(capture.blob, language);
        if (turnSeq.current !== seq) return;
        const text = hosted?.text.trim();
        if (hosted && text) return await processText(text, { provider: hosted.provider, ms: hosted.ms });
      }
      if (!browserText && !capture && captureTried) {
        // nothing heard AND nothing recorded: if the mic itself is the problem, say that instead of "didn't catch"
        const why = micMessage(captureProblem(), promptPending, language);
        if (why) {
          restoreVolume();
          setStage('responding');
          setAiResponse(why);
          setActiveStep(-1);
          return;
        }
      }
      await processText(browserText, { provider: 'browser' });
    } catch {
      restoreVolume(); // idempotent; whatever threw, the lecture must not stay ducked
      if (turnSeq.current !== seq) return; // a newer hold owns the modal now
      setStage('responding');
      setAiResponse(SAY.failed[language]);
      setActiveStep(-1);
    }
  }, [processText, restoreVolume]);
  stopRef.current = stopListeningAndProcess;

  /** The hold ended without a key-up (window blur / tab hidden): drop it instead of sending a stale recording. */
  const abortListening = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    turnSeq.current += 1; // anything still waiting from this hold is stale
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(promptTimer.current);
    const { asr, language } = optsRef.current;
    const prompting = micPromptPending(); // clicking the permission bubble blurs the page too
    asr.abort();
    abortCapture();
    restoreVolume();
    setStage('idle');
    setRecognizedText('');
    setActiveStep(-1);
    setNotice(prompting ? SAY.allowMic[language] : SAY.lostFocus[language]);
  }, [restoreVolume]);

  useEffect(() => {
    const isInputField = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.getAttribute('contenteditable') === 'true';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        if (isInputField(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!keyDownRef.current && !e.repeat) {
          keyDownRef.current = true;
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        if (isInputField(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        if (keyDownRef.current) {
          keyDownRef.current = false;
          void stopListeningAndProcess();
        }
      }
    };

    // Alt-tab, an OS dialog or the permission bubble swallow the key-up: without this keyDownRef stays true,
    // the next press is ignored, and its release would send the old recording.
    const releaseHold = () => {
      keyDownRef.current = false;
      abortListening();
    };

    // Capture phase so the page gets the key before other handlers.
    // Clicking the YouTube iframe moves keyboard focus into it, after which ~ never reaches us.
    // Pull focus back to the page right after (mouse control of the player keeps working).
    const handleWindowBlur = () => {
      releaseHold();
      window.setTimeout(() => {
        const el = document.activeElement;
        if (el && el.tagName === 'IFRAME') {
          (el as HTMLIFrameElement).blur();
          window.focus();
        }
      }, 0);
    };
    const handleVisibility = () => {
      if (document.hidden) releaseHold();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startListening, stopListeningAndProcess, abortListening]);

  // leaving the study page mid-hold or mid-answer: the mic must not stay recording, nor the lecture ducked
  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(promptTimer.current);
      window.clearTimeout(duckTimer.current);
      listeningRef.current = false;
      turnSeq.current += 1;
      abortCapture();
      speechRef.current?.cancel();
      stopSpeaking();
    },
    []
  );

  const closeModal = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(promptTimer.current);
    listeningRef.current = false;
    keyDownRef.current = false;
    turnSeq.current += 1;
    speechRef.current?.cancel();
    optsRef.current.asr.abort();
    abortCapture();
    restoreVolume();
    stopSpeaking();
    setIsOpen(false);
    setStage('idle');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);
    setMeta(null);
    setNotice(null);
    setCanAskAgain(false);
  }, [restoreVolume]);

  /** Send the last thing the learner said again (after the connection dropped or the server timed out). */
  const askAgain = useCallback(() => {
    const last = lastAskRef.current;
    if (!last) return;
    optsRef.current.player.duck();
    void processText(last.text, last.stt);
  }, [processText]);

  return {
    isOpen,
    stage,
    recognizedText: stage === 'listening' ? options.asr.interim : recognizedText,
    aiResponse,
    activeStep,
    meta,
    error: error || options.asr.error,
    notice,
    canAskAgain,
    askAgain,
    startListening,
    stopListeningAndProcess,
    processText,
    closeModal,
    setIsOpen,
  };
}
