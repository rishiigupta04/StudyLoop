import { useState, useEffect, useCallback } from 'react';

export function useAppFullscreen(targetRef?: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const elem = targetRef?.current || document.documentElement;

    if (!document.fullscreenElement) {
      elem
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => {
          console.warn(`Error attempting to exit fullscreen: ${err.message}`);
        });
    }
  }, [targetRef]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
