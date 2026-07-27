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
  </React.StrictMode>
);
