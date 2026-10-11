import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { warmUpBackend } from './services/apiClient';
import './styles/tailwind.css';

// Wake a sleeping free-tier backend as early as possible (roadmap D11).
warmUpBackend();

// Errors React never sees (event handlers, async code): log them, nothing more.
window.addEventListener('error', (e) => console.error('[window error]', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) =>
  console.error('[unhandled rejection]', e.reason)
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* last resort: catches a crash in the providers or the router themselves */}
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          visibleToasts={3}
          expand={true}
          gap={10}
          closeButton
          duration={3000}
          toastOptions={{
            style: {
              background: '#151926',
              border: '1px solid rgba(124, 58, 237, 0.4)',
              color: '#F8FAFC',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(124, 58, 237, 0.25)',
              borderRadius: '16px',
              padding: '12px 16px',
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
