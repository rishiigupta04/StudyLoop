import React from 'react';
import Sidebar from './Sidebar';
import MobileNav from './mobile/MobileNav';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

export default function AppLayout({ children, activeRoute }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-obsidian overflow-hidden relative">
      {/* Desktop Left Sidebar (Hidden on mobile < 768px) */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar activeRoute={activeRoute} />
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto scrollbar-thin flex flex-col min-h-0 pb-20 md:pb-0 w-full max-w-full overflow-x-hidden">
        {children}
      </main>

      {/* Translucent Mobile Bottom Navigation Bar (Visible only on mobile < 768px) */}
      <MobileNav />
    </div>
  );
}