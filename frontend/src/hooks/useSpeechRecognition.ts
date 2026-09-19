import { useCallback, useEffect, useRef, useState } from 'react';

export type AsrLang = 'en-IN' | 'hi-IN';

export interface SpeechRecognitionApi {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  /** start capturing; resolves nothing — call stop() to get the final transcript */
  start: (lang: AsrLang) => void;
  /** stop and resolve with the final transcript ('' if nothing was heard) */
  stop: () => Promise<string>;
  abort: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow it in the browser address bar.',
  'service-not-allowed': 'Speech recognition is blocked in this browser.',
  'audio-capture': 'No microphone found.',
  network: 'Speech recognition needs an internet connection.',
};

/**
 * Browser-native ASR (Web Speech API). Chrome/Edge only — Firefox has no SpeechRecognition.
 * Only recognized TEXT goes to the backend; audio never leaves the browser's speech service.
 */
export function useSpeechRecognition(): SpeechRecognitionApi {
  const Ctor = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const resolverRef = useRef<((text: string) => void) | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(() => {
    setListening(false);
    const text = (finalRef.current || interimRef.current).trim();
    resolverRef.current?.(text);
    resolverRef.current = null;
  }, []);

  const start = useCallback(
    (lang: AsrLang) => {
      if (!Ctor) {
        setError('Voice input needs Chrome or Edge.');
        return;
      }
      recRef.current?.abort();
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true; // keep listening while the key is held
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      finalRef.current = '';
      interimRef.current = '';
      setInterim('');
      setError(null);

      rec.onresult = (e) => {
        let finalText = '';
        let interimText = '';
        // continuous mode returns one result per phrase; hi-IN often omits the leading space, which
        // would glue "पीछे" + "जाओ" into one word — join with spaces, collapse later
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += ' ' + r[0].transcript;
          else interimText += ' ' + r[0].transcript;
        }
        finalRef.current = finalText.replace(/\s+/g, ' ').trim();
        interimRef.current = interimText.replace(/\s+/g, ' ').trim();
        setInterim((finalRef.current + ' ' + interimRef.current).trim());
      };
      rec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') setError(ERROR_MESSAGES[e.error] || `Speech error: ${e.error}`);
      };
      rec.onend = finish;
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        /* start() throws if already started — harmless */
      }
    },
    [Ctor, finish]
  );

  const stop = useCallback(() => {
    return new Promise<string>((resolve) => {
      const rec = recRef.current;
      if (!rec) return resolve('');
      resolverRef.current = resolve;
      rec.stop(); // onend → finish() resolves with the final transcript
      // safety net: some browsers never fire onend after a network hiccup
      window.setTimeout(() => {
        if (resolverRef.current === resolve) finish();
      }, 2500);
    });
  }, [finish]);

  const abort = useCallback(() => {
    resolverRef.current = null;
    recRef.current?.abort();
    setListening(false);
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: Boolean(Ctor), listening, interim, error, start, stop, abort };
}
