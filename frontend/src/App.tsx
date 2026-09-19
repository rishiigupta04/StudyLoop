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

const guarded = (page: React.ReactNode) => <RequireAuth>{page}</RequireAuth>;

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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </GamificationProvider>
    </AuthProvider>
  );
}
