import { useState, useEffect, useCallback, useRef } from 'react';
import { executePlayerAction, type PlayerControls } from '@/lib/playerActions';
import { speak, stopSpeaking } from '@/lib/tts';
import type { AsrLang, SpeechRecognitionApi } from './useSpeechRecognition';
import type { Lang, TurnResult } from './useStudySocket';

export type PTTStage = 'idle' | 'listening' | 'processing' | 'responding';

export interface TurnMeta {
  route: string | null;
  intent: string | null;
  confidence: number | null;
  normalizedText?: string | null;
  serverMs?: number;
  roundTripMs: number;
  isAction: boolean;
}

interface UseTildePTTOptions {
  language: Lang;
  asr: SpeechRecognitionApi;
  player: PlayerControls & { duck: () => void; unduck: () => void };
  sendUtterance: (text: string) => Promise<TurnResult>;
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
  stageRef.current = stage;

  const startListening = useCallback(() => {
    const { asr, language, player, cancelTurn } = optsRef.current;
    window.clearTimeout(closeTimer.current);
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
    asr.start(lang);
  }, []);

  /** Everything after ASR: send the recognized text, execute the action or speak the answer. */
  const processText = useCallback(async (text: string) => {
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
    const { msg, roundTripMs } = await sendUtterance(text);
    setActiveStep(3);

    if (msg.type === 'error') {
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
    };
    setMeta(m);

    if (msg.type === 'action') {
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
      player.unduck();
      setAiResponse(msg.text);
      setStage('responding');
      onTurn?.(text, msg.text, m);
      void speak(msg.text, language);
    }
  }, []);

  const stopListeningAndProcess = useCallback(async () => {
    if (stageRef.current !== 'listening') return;
    setStage('processing');
    await processText(await optsRef.current.asr.stop());
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
    optsRef.current.asr.abort();
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
