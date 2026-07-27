import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardHero from '@/app/dashboard-home/components/DashboardHero';
import RecentVideosGrid from '@/app/dashboard-home/components/RecentVideosGrid';
import StatsBar from '@/app/dashboard-home/components/StatsBar';
import StudyTimeChart from '@/app/dashboard-home/components/StudyTimeChart';
import LibraryShortcuts from '@/app/dashboard-home/components/LibraryShortcuts';
import AIQuizWidget from '@/app/dashboard-home/components/AIQuizWidget';
import RecentNotesStream from '@/app/dashboard-home/components/RecentNotesStream';

export default function DashboardHomePage() {
  return (
    <AppLayout activeRoute="/dashboard-home">
      <div className="min-h-screen bg-obsidian px-6 py-8 xl:px-10 2xl:px-16 max-w-screen-2xl">
        {/* Main Hero & Quick Command Station */}
        <DashboardHero />

        {/* Core Metrics Bar */}
        <StatsBar />

        {/* 2-Column Responsive Dashboard Layout */}
        <div className="mt-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Main Column (2/3 Width) */}
          <div className="xl:col-span-2 space-y-8">
            <RecentVideosGrid />
            <RecentNotesStream />
          </div>

          {/* Right Sidebar Column (1/3 Width) */}
          <div className="xl:col-span-1 flex flex-col gap-8">
            <AIQuizWidget />
            <StudyTimeChart />
            <LibraryShortcuts />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
