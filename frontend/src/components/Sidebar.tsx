import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';
import { useGamification } from '@/context/GamificationContext';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard-home', icon: 'HomeIcon', badge: undefined },
  { label: 'Study', href: '/video-study-page', icon: 'PlayCircleIcon', badge: 1 },
  { label: 'Library', href: '/library', icon: 'BookOpenIcon', badge: 14 },
  { label: 'Notes', href: '/notes', icon: 'DocumentTextIcon', badge: 67 },
  { label: 'Chat History', href: '/chat-history', icon: 'ChatBubbleLeftRightIcon', badge: 5 },
];

interface SidebarProps {
  activeRoute: string;
}

export default function Sidebar({ activeRoute }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { xp, level, levelTitle, streakDays, prevLevelXP, nextLevelXP } = useGamification();
  const navigate = useNavigate();

  const currentLevelXP = xp - prevLevelXP;
  const levelTargetXP = nextLevelXP - prevLevelXP;
  const xpPercent = Math.min(100, Math.max(0, (currentLevelXP / levelTargetXP) * 100));

  const handleSignOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toast.success('Signed out successfully!');
    navigate('/');
    window.location.href = '/';
  };

  const handleGoToSettings = () => {
    navigate('/settings');
  };

  return (
    <aside
      className={`flex-shrink-0 flex flex-col h-screen bg-obsidian border-r border-border/80 z-40 relative select-none transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Clickable Logo Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/60 min-h-[64px] flex-shrink-0">
        <Link
          to="/"
          className="flex items-center gap-3 overflow-hidden cursor-pointer group"
          title="Go to StudyLoop Landing Page"
        >
          <AppLogo size={32} />
          {!collapsed && (
            <span className="font-extrabold text-base text-foreground tracking-tight whitespace-nowrap group-hover:text-indigo-400 transition-colors">
              Study<span className="gradient-text-indigo">Loop</span>
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-all duration-150 flex-shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'ChevronRightIcon' : 'ChevronLeftIcon'} size={16} />
        </button>
      </div>

      {/* Real-Time XP & Level Gamification Banner */}
      {!collapsed ? (
        <div className="mx-2.5 mt-3 p-3 rounded-2xl bg-[#151926] border border-indigo-500/40 relative overflow-hidden shadow-md space-y-2 flex-shrink-0">
          {/* Header Row: Level Badge & Streak Counter */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono shadow-sm uppercase tracking-wider">
              Level {level}
            </span>
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              <Icon name="FireIcon" size={13} className="text-amber-400" />
              <span>{streakDays}d Streak</span>
            </div>
          </div>

          {/* Title Row */}
          <div>
            <span className="text-xs font-black text-foreground tracking-tight block">
              {levelTitle}
            </span>
          </div>

          {/* Bottom Row: XP Stats & Progress Bar */}
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground font-medium">XP Progress</span>
              <span className="text-indigo-300 font-bold tabular-nums">
                {xp} / {nextLevelXP} XP
              </span>
            </div>
            <div className="w-full h-2 bg-[#0B0E17] rounded-full overflow-hidden p-[1px] border border-border/60">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${Math.max(5, xpPercent)}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-1 text-center py-2 px-1 bg-[#151926] border-y border-indigo-500/30 flex-shrink-0">
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono whitespace-nowrap">
            L{level}
          </span>
          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
            🔥{streakDays}
          </span>
        </div>
      )}

      {/* Nav Items */}
      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-hidden">
        {navItems.map((item) => {
          const isActive = activeRoute === item.href;
          return (
            <Link
              key={`nav-${item.href}`}
              to={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 font-semibold border-r-2 border-indigo-500'
                  : 'text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground'
              }`}
            >
              <div className="flex-shrink-0 z-10">
                <Icon
                  name={item.icon as Parameters<typeof Icon>[0]['name']}
                  size={20}
                  className={isActive ? 'text-indigo-400' : 'text-muted-foreground group-hover:text-foreground'}
                />
              </div>

              {!collapsed && (
                <div className="flex-1 flex items-center justify-between overflow-hidden z-10">
                  <span className="text-sm truncate block">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                        isActive
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-surface-elevated text-muted-foreground'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}

              {collapsed && item.badge !== undefined && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular-nums z-10 shadow-glow-indigo-sm">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile Footer */}
      <div className="border-t border-border/60 p-3 flex-shrink-0">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : 'w-full'}`}>
          <button
            type="button"
            onClick={handleGoToSettings}
            className="flex items-center gap-3 flex-1 overflow-hidden p-1.5 rounded-xl hover:bg-surface-elevated/70 transition-all text-left group/usr cursor-pointer"
            title="Open Account & Settings (/settings)"
          >
            <div className="w-8 h-8 rounded-full gradient-indigo-cyan flex items-center justify-center flex-shrink-0 text-white text-xs font-extrabold shadow-glow-indigo-sm group-hover/usr:scale-105 transition-transform">
              RG
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-foreground truncate group-hover/usr:text-indigo-300 transition-colors">
                  Rishiraj Gupta
                </p>
                <p className="text-xs text-muted-foreground truncate">rishiraj@studyloop.ai</p>
              </div>
            )}
          </button>

          {!collapsed && (
            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-xl hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-all duration-150 flex-shrink-0"
              aria-label="Sign out"
              title="Sign out and return to Landing Page"
            >
              <Icon name="ArrowRightOnRectangleIcon" size={18} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}