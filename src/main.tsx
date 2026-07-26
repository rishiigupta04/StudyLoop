import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import './styles/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1E293B',
            border: '1px solid rgba(108, 63, 197, 0.3)',
            color: '#F1F5F9',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
