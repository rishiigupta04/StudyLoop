import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardHero from './components/DashboardHero';
import RecentVideosGrid from './components/RecentVideosGrid';
import StatsBar from './components/StatsBar';
import StudyTimeChart from './components/StudyTimeChart';
import LibraryShortcuts from './components/LibraryShortcuts';

export default function DashboardHomePage() {
  return (
    <AppLayout activeRoute="/dashboard-home">
      <div className="min-h-screen bg-background px-6 py-6 xl:px-10 2xl:px-16 max-w-screen-2xl">
        <DashboardHero />
        <StatsBar />
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <RecentVideosGrid />
          </div>
          <div className="xl:col-span-1 flex flex-col gap-6">
            <StudyTimeChart />
            <LibraryShortcuts />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}