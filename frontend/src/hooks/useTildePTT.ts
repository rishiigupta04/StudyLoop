import { useState, useEffect, useCallback, useRef } from 'react';
import { executePlayerAction, type PlayerControls } from '@/lib/playerActions';
import { createSpeechStream, stopSpeaking, type SpeechStream } from '@/lib/tts';
import { abortCapture, captureSupported, startCapture, stopCapture } from '@/lib/audioCapture';
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
  const stageRef = useRef<PTTStage>('idle');
  const closeTimer = useRef<number | undefined>(undefined);
  const turnSeq = useRef(0); // a newer command supersedes an answer still in flight
  const speechRef = useRef<SpeechStream | null>(null);
  stageRef.current = stage;

  const startListening = useCallback(() => {
    const { asr, language, player, cancelTurn } = optsRef.current;
    window.clearTimeout(closeTimer.current);
    turnSeq.current += 1;
    speechRef.current?.cancel();
    stopSpeaking(); // barge-in: new command interrupts stale audio
    cancelTurn?.();
    player.duck();
    setIsOpen(true);
    setStage('listening');
    setRecognizedText('');
    setAiResponse('');
    setMeta(null);
    setError(null);
    setActiveStep(0);
    const lang: AsrLang = language === 'hi' ? 'hi-IN' : 'en-IN';
    // hosted STT (D14) records the audio; the browser recognizer still gives live captions while ~ is held
    const hosted = hostedSttAvailable() && captureSupported();
    if (hosted) void startCapture();
    if (asr.supported || !hosted) asr.start(lang); // without either, asr.start reports "needs Chrome or Edge"
  }, []);

  /** Everything after ASR: send the recognized text, execute the action or speak the answer. */
  const processText = useCallback(async (text: string, stt?: SttInfo) => {
    const { player, sendUtterance, onTurn, language } = optsRef.current;
    window.clearTimeout(closeTimer.current);
    setIsOpen(true);
    setStage('processing');
    setAiResponse('');
    setMeta(null);
    setRecognizedText(text);
    if (!text) {
      player.unduck();
      setStage('responding');
      setAiResponse(language === 'hi' ? 'कुछ सुनाई नहीं दिया — ~ दबाकर रखें और बोलें।' : "Didn't catch anything — hold ~ while you speak.");
      setActiveStep(-1);
      return;
    }
    setActiveStep(1);
    const seq = ++turnSeq.current;
    speechRef.current?.cancel();
    // D8: the lecture stays ducked while the answer is spoken, and comes back once it's done
    const speech = createSpeechStream(language, () => {
      if (turnSeq.current === seq) player.unduck();
    });
    speechRef.current = speech;
    let streamed = '';
    const { msg, roundTripMs } = await sendUtterance(text, {
      onDelta: (d) => {
        if (turnSeq.current !== seq) return;
        if (!streamed) {
          setStage('responding');
          setActiveStep(3);
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
      player.unduck();
      setError(msg.message);
      setAiResponse(msg.message);
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
      player.unduck(); // restore before the action so VOLUME/MUTE actions apply to the real level
      executePlayerAction(player, msg.action);
      setAiResponse(msg.message);
      setStage('responding');
      onTurn?.(text, msg.message, m);
      closeTimer.current = window.setTimeout(() => {
        setIsOpen(false);
        setStage('idle');
      }, ACTION_AUTOCLOSE_MS);
    } else {
      setAiResponse(msg.text);
      setStage('responding');
      onTurn?.(text, msg.text, m);
      if (msg.cancelled) {
        speech.cancel();
        player.unduck();
        return;
      }
      if (!streamed) speech.push(msg.text); // template answers (no transcript, not covered yet…) don't stream
      speech.end();
    }
  }, []);

  const stopListeningAndProcess = useCallback(async () => {
    if (stageRef.current !== 'listening') return;
    setStage('processing');
    const { asr, language } = optsRef.current;
    const [browserText, capture] = await Promise.all([
      asr.supported ? asr.stop() : Promise.resolve(''),
      stopCapture(),
    ]);
    setRecognizedText(browserText); // shown while the hosted transcript is on its way
    if (capture && capture.durationMs > 250) {
      const hosted = await transcribeAudio(capture.blob, language);
      const text = hosted?.text.trim();
      if (hosted && text) return processText(text, { provider: hosted.provider, ms: hosted.ms });
    }
    await processText(browserText, { provider: 'browser' });
  }, [processText]);

  useEffect(() => {
    let keyIsDown = false;

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
        if (!keyIsDown && !e.repeat) {
          keyIsDown = true;
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        if (isInputField(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        if (keyIsDown) {
          keyIsDown = false;
          void stopListeningAndProcess();
        }
      }
    };

    // Capture phase so the page gets the key before other handlers.
    // Clicking the YouTube iframe moves keyboard focus into it, after which ~ never reaches us.
    // Pull focus back to the page right after (mouse control of the player keeps working).
    const handleWindowBlur = () => {
      window.setTimeout(() => {
        const el = document.activeElement;
        if (el && el.tagName === 'IFRAME') {
          (el as HTMLIFrameElement).blur();
          window.focus();
        }
      }, 0);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [startListening, stopListeningAndProcess]);

  const closeModal = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    turnSeq.current += 1;
    speechRef.current?.cancel();
    optsRef.current.asr.abort();
    abortCapture();
    optsRef.current.player.unduck();
    stopSpeaking();
    setIsOpen(false);
    setStage('idle');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);
    setMeta(null);
  }, []);

  return {
    isOpen,
    stage,
    recognizedText: stage === 'listening' ? options.asr.interim : recognizedText,
    aiResponse,
    activeStep,
    meta,
    error: error || options.asr.error,
    startListening,
    stopListeningAndProcess,
    processText,
    closeModal,
    setIsOpen,
  };
}
