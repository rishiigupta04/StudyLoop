import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardHomePage from './pages/DashboardHomePage';
import VideoStudyPage from './pages/VideoStudyPage';
import LibraryPage from './pages/LibraryPage';
import NotesPage from './pages/NotesPage';
import ChatHistoryPage from './pages/ChatHistoryPage';
import SettingsPage from './pages/SettingsPage';
import NotFound from './pages/NotFound';
import RequireAuth from './components/RequireAuth';
import { AuthProvider } from './context/AuthContext';
import { GamificationProvider } from './context/GamificationContext';
import { COLLECT } from './lib/features';

const guarded = (page: React.ReactNode) => <RequireAuth>{page}</RequireAuth>;

// Dev-only Tier 1c recording tool. The flag is a build-time constant, so with VITE_COLLECT unset
// this branch and the whole chunk behind it are dropped: /collect falls through to NotFound.
const CollectPage = COLLECT ? React.lazy(() => import('./pages/CollectPage')) : null;

export default function App() {
  return (
    <AuthProvider>
      <GamificationProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard-home" element={guarded(<DashboardHomePage />)} />
          <Route path="/video-study-page" element={guarded(<VideoStudyPage />)} />
          <Route path="/library" element={guarded(<LibraryPage />)} />
          <Route path="/notes" element={guarded(<NotesPage />)} />
          <Route path="/chat-history" element={guarded(<ChatHistoryPage />)} />
          <Route path="/settings" element={guarded(<SettingsPage />)} />
          {CollectPage && (
            <Route
              path="/collect"
              element={
                <React.Suspense fallback={null}>
                  <CollectPage />
                </React.Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </GamificationProvider>
    </AuthProvider>
  );
}
