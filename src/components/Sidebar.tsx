'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';

interface NavItem {
  label: string;
  labelHi: string;
  href: string;
  icon: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', labelHi: 'होम', href: '/dashboard-home', icon: 'HomeIcon', badge: undefined },
  { label: 'Study', labelHi: 'अध्ययन', href: '/video-study-page', icon: 'PlayCircleIcon', badge: 1 },
  { label: 'Library', labelHi: 'लाइब्रेरी', href: '/library', icon: 'BookOpenIcon', badge: 14 },
  { label: 'Notes', labelHi: 'नोट्स', href: '/notes', icon: 'DocumentTextIcon', badge: 67 },
  { label: 'Chat History', labelHi: 'चैट इतिहास', href: '/chat-history', icon: 'ChatBubbleLeftRightIcon', badge: 5 },
];

const langOptions = ['EN', 'HI', 'Hinglish'] as const;
type Lang = typeof langOptions[number];

interface SidebarProps {
  activeRoute: string;
}

export default function Sidebar({ activeRoute }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeLang, setActiveLang] = useState<Lang>('Hinglish');

  return (
    <aside
      className={`sidebar-transition flex-shrink-0 flex flex-col h-screen bg-secondary border-r border-border z-40 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border min-h-[64px]">
        <div className="flex items-center gap-3 overflow-hidden">
          <AppLogo size={32} />
          {!collapsed && (
            <span className="font-extrabold text-base text-foreground tracking-tight whitespace-nowrap">
              StudyLoop
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 flex-shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'} size={16} />
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-hidden">
        {navItems.map((item) => {
          const isActive = activeRoute === item.href;
          return (
            <Link
              key={`nav-${item.href}`}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
                isActive
                  ? 'sidebar-nav-active' :'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <div className="flex-shrink-0">
                <Icon
                  name={item.icon as Parameters<typeof Icon>[0]['name']}
                  size={20}
                  className={isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}
                />
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 overflow-hidden">
                    <span className="text-sm font-medium truncate block">{item.label}</span>
                    <span className="text-xs text-muted-foreground truncate block leading-tight">{item.labelHi}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.badge !== undefined && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-xs font-bold rounded-full flex items-center justify-center tabular-nums">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Language Toggle */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2 font-medium tracking-wide uppercase">Language / भाषा</p>
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {langOptions.map((lang) => (
              <button
                key={`lang-${lang}`}
                onClick={() => setActiveLang(lang)}
                className={`flex-1 text-xs font-semibold py-1 rounded-md transition-all duration-150 ${
                  activeLang === lang
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User Profile */}
      <div className={`border-t border-border p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? '' : 'w-full'}`}>
          <div className="w-8 h-8 rounded-full gradient-purple-blue flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
            A
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">Arjun Sharma</p>
              <p className="text-xs text-muted-foreground truncate">student@studyloop.ai</p>
            </div>
          )}
          {!collapsed && (
            <Link
              href="/login-page"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive transition-all duration-150"
              aria-label="Sign out"
            >
              <Icon name="ArrowRightOnRectangleIcon" size={16} />
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}