import { useState, useEffect, useCallback } from 'react';

export type PTTStage = 'idle' | 'listening' | 'processing' | 'responding';

interface UseTildePTTOptions {
  onSeekTimestamp?: (timestamp: string) => void;
}

export function useTildePTT(options?: UseTildePTTOptions) {
  const [stage, setStage] = useState<PTTStage>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [activeStep, setActiveStep] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const startListening = useCallback(() => {
    setIsOpen(true);
    setStage('listening');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);
  }, []);

  const stopListeningAndProcess = useCallback(() => {
    setStage('processing');
    setRecognizedText('What is the time complexity of peak finding?');

    let step = 0;
    const interval = setInterval(() => {
      setActiveStep(step);
      step++;
      if (step >= 5) {
        clearInterval(interval);
        setAiResponse(
          'Peak finding using divide and conquer has O(log n) time complexity for 1D arrays. For 2D arrays, the optimal approach runs in O(n log n). You can see this explained at 24 minutes and 10 seconds in the video.'
        );
        setStage('responding');
      }
    }, 350);
  }, []);

  useEffect(() => {
    let keyIsDown = false;

    const isInputField = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName.toUpperCase();
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.getAttribute('contenteditable') === 'true'
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Tilde / Backquote key detection: ~ or ` or Backquote code
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        if (isInputField(document.activeElement)) return; // Don't intercept when typing in inputs

        e.preventDefault();
        if (!keyIsDown) {
          keyIsDown = true;
          startListening();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '~' || e.key === '`') {
        if (isInputField(document.activeElement)) return;

        e.preventDefault();
        if (keyIsDown) {
          keyIsDown = false;
          stopListeningAndProcess();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startListening, stopListeningAndProcess]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setStage('idle');
    setRecognizedText('');
    setAiResponse('');
    setActiveStep(-1);
  }, []);

  return {
    isOpen,
    stage,
    recognizedText,
    aiResponse,
    activeStep,
    startListening,
    stopListeningAndProcess,
    closeModal,
    setIsOpen,
  };
}
