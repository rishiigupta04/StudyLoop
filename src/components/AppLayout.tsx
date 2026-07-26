import React from 'react';
import Sidebar from './Sidebar';

interface AppLayoutProps {
  children: React.ReactNode;
  activeRoute: string;
}

export default function AppLayout({ children, activeRoute }: AppLayoutProps) {
  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background overflow-hidden">
      <Sidebar activeRoute={activeRoute} />
      <main className="flex-1 overflow-y-auto scrollbar-thin flex flex-col min-h-0 pb-16 lg:pb-0">
        {children}
      </main>
    </div>
  );
}