import React from 'react';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

export default function AppLayout({ children, activeRoute }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeRoute={activeRoute} />
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden scrollbar-thin">
        {children}
      </main>
    </div>
  );
}