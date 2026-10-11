import React from 'react';

/**
 * Catches render crashes below it so one bad payload (a malformed outline, an odd WS message) shows
 * a card with a way out instead of a blank page. Deliberately depends on nothing but React: no router,
 * no context, no app imports, so the fallback itself cannot throw. The language comes straight from
 * the same localStorage key as lib/uiLang (EN / हिं), read inside try/catch for blocked storage.
 */

const COPY = {
  en: {
    title: 'Something went wrong',
    body: 'This page hit an unexpected error. Reloading usually fixes it. Your saved notes and library are not affected.',
    reload: 'Reload',
    back: 'Back to library',
  },
  hi: {
    title: 'कुछ गड़बड़ हो गई',
    body: 'इस पेज में एक अनपेक्षित त्रुटि आ गई। रीलोड करने से आमतौर पर यह ठीक हो जाता है। आपके सेव किए गए नोट्स और लाइब्रेरी सुरक्षित हैं।',
    reload: 'रीलोड करें',
    back: 'लाइब्रेरी पर वापस जाएँ',
  },
};

function currentCopy() {
  try {
    return localStorage.getItem('studyloop.lang') === 'hi' ? COPY.hi : COPY.en;
  } catch {
    return COPY.en;
  }
}

/** The message card. Exported so a route can show it inside its own chrome (e.g. beside the sidebar). */
export function ErrorCard({ fullScreen = false }: { fullScreen?: boolean }) {
  const t = currentCopy();
  return (
    <div
      role="alert"
      className={`flex w-full items-center justify-center p-6 ${
        fullScreen ? 'min-h-screen bg-obsidian' : 'min-h-[60vh]'
      }`}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-card p-6 text-center shadow-xl">
        <h2 className="mb-2 text-xl font-semibold text-white">{t.title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">{t.body}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
          >
            {t.reload}
          </button>
          {/* a plain link on purpose: a full page load also clears whatever state caused the crash */}
          <a
            href="/library"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
          >
            {t.back}
          </a>
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown instead of the default full-screen card. */
  fallback?: React.ReactNode;
  /** When this changes (pass the URL) a crashed boundary tries its children again. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] render crash:', error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorCard fullScreen />;
    }
    return this.props.children;
  }
}
