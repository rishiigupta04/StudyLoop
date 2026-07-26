import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardHomePage from './pages/DashboardHomePage';
import VideoStudyPage from './pages/VideoStudyPage';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard-home" element={<DashboardHomePage />} />
      <Route path="/video-study-page" element={<VideoStudyPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
