import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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

  const currentLevelXP = xp - prevLevelXP;
  const levelTargetXP = nextLevelXP - prevLevelXP;
  const xpPercent = Math.min(100, Math.max(0, (currentLevelXP / levelTargetXP) * 100));

  return (
    <aside
      className={`sidebar-transition flex-shrink-0 flex flex-col h-screen bg-obsidian border-r border-border/80 z-40 relative ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/60 min-h-[64px]">
        <div className="flex items-center gap-3 overflow-hidden">
          <AppLogo size={32} />
          {!collapsed && (
            <span className="font-extrabold text-base text-foreground tracking-tight whitespace-nowrap">
              Study<span className="gradient-text-indigo">Loop</span>
            </span>
          )}
        </div>
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
        <div className="mx-3 mt-3 p-3 rounded-2xl bg-surface-card border border-indigo-500/30 relative overflow-hidden shadow-glow-indigo-sm">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono shadow-sm">
                Lvl {level}
              </span>
              <span className="text-xs font-bold text-foreground truncate max-w-[100px]">
                {levelTitle}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
              <span>🔥</span>
              <span>{streakDays}d</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>XP Progress</span>
              <span className="text-indigo-300 font-semibold">
                {xp} / {nextLevelXP} XP
              </span>
            </div>
            <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-indigo-cyan rounded-full transition-all duration-500"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-1 text-center">
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono">
            L{level}
          </span>
          <span className="text-[10px] font-bold text-amber-400">🔥{streakDays}</span>
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
                  ? 'text-indigo-300 font-semibold'
                  : 'text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground'
              }`}
            >
              {/* Framer Motion Active Indicator Pill */}
              {isActive && (
                <motion.div
                  layoutId="sidebarActivePill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600/25 to-indigo-600/5 border-r-2 border-indigo-500 shadow-glow-indigo-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              <div className="flex-shrink-0 z-10">
                <Icon
                  name={item.icon as Parameters<typeof Icon>[0]['name']}
                  size={20}
                  className={isActive ? 'text-indigo-400' : 'text-muted-foreground group-hover:text-foreground'}
                />
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 overflow-hidden z-10">
                    <span className="text-sm truncate block">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums flex-shrink-0 z-10 ${
                        isActive
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-surface-elevated text-muted-foreground'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
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
      <div className={`border-t border-border/60 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? '' : 'w-full'}`}>
          <div className="w-8 h-8 rounded-full gradient-indigo-cyan flex items-center justify-center flex-shrink-0 text-white text-xs font-extrabold shadow-glow-indigo-sm">
            AS
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-foreground truncate">Arjun Sharma</p>
              <p className="text-xs text-muted-foreground truncate">student@studyloop.ai</p>
            </div>
          )}
          {!collapsed && (
            <Link
              to="/"
              className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-red-400 transition-all duration-150"
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