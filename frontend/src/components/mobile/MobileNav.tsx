import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '@/components/ui/AppIcon';

interface MobileNavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

const mobileNavItems: MobileNavItem[] = [
  { label: 'Home', href: '/dashboard-home', icon: 'HomeIcon' },
  { label: 'Study', href: '/video-study-page', icon: 'PlayCircleIcon', badge: 1 },
  { label: 'Library', href: '/library', icon: 'BookOpenIcon' },
  { label: 'Notes', href: '/notes', icon: 'DocumentTextIcon', badge: 67 },
  { label: 'Chat', href: '/chat-history', icon: 'ChatBubbleLeftRightIcon', badge: 5 },
  { label: 'Profile', href: '/settings', icon: 'UserIcon' },
];

export default function MobileNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="block md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0D111D]/90 backdrop-blur-xl border-t border-indigo-500/30 px-2 py-1.5 shadow-2xl select-none">
      <div className="flex items-center justify-around">
        {mobileNavItems.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <Link
              key={`mobile-nav-${item.href}`}
              to={item.href}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-200 relative min-w-[52px] min-h-[48px] ${
                isActive
                  ? 'bg-indigo-600/30 text-indigo-300 font-bold shadow-glow-indigo-sm border border-indigo-500/40'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative">
                <Icon
                  name={item.icon as Parameters<typeof Icon>[0]['name']}
                  size={20}
                  className={isActive ? 'text-indigo-400' : 'text-muted-foreground'}
                />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 bg-indigo-600 text-white text-[9px] font-extrabold px-1 rounded-full tabular-nums border border-obsidian">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap truncate max-w-[56px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
