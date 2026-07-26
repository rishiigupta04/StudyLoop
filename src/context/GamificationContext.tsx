import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';

export interface GamificationState {
  xp: number;
  level: number;
  levelTitle: string;
  streakDays: number;
  nextLevelXP: number;
  prevLevelXP: number;
  dailyXPEarned: number;
  badgesUnlocked: string[];
  awardXP: (amount: number, reason: string) => void;
}

const levelTitles = [
  'Novice Scholar',
  'Algorithmic Apprentice',
  'Deep Learner',
  'Synthesis Master',
  'StudyLoop Grandmaster',
];

const levelThresholds = [0, 250, 750, 1500, 3000];

const GamificationContext = createContext<GamificationState | undefined>(undefined);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [xp, setXp] = useState<number>(() => {
    const saved = localStorage.getItem('studyloop_xp');
    return saved ? parseInt(saved, 10) : 1420;
  });

  const [streakDays] = useState(5);
  const [dailyXPEarned, setDailyXPEarned] = useState(65);
  const [badgesUnlocked, setBadgesUnlocked] = useState<string[]>([
    'FIRST_VOICE_QUERY',
    'STREAK_5_DAYS',
    'ALGO_STARTER',
  ]);

  // Calculate current level
  let level = 1;
  if (xp >= 3000) level = 5;
  else if (xp >= 1500) level = 4;
  else if (xp >= 750) level = 3;
  else if (xp >= 250) level = 2;

  const levelTitle = levelTitles[level - 1] || 'StudyLoop Scholar';
  const prevLevelXP = levelThresholds[level - 1] || 0;
  const nextLevelXP = levelThresholds[level] || 3000;

  useEffect(() => {
    localStorage.setItem('studyloop_xp', xp.toString());
  }, [xp]);

  const awardXP = (amount: number, reason: string) => {
    setXp((prevXP) => {
      const newXP = prevXP + amount;
      
      // Level up check
      let oldLevel = 1;
      if (prevXP >= 3000) oldLevel = 5;
      else if (prevXP >= 1500) oldLevel = 4;
      else if (prevXP >= 750) oldLevel = 3;
      else if (prevXP >= 250) oldLevel = 2;

      let newLevel = 1;
      if (newXP >= 3000) newLevel = 5;
      else if (newXP >= 1500) newLevel = 4;
      else if (newXP >= 750) newLevel = 3;
      else if (newXP >= 250) newLevel = 2;

      if (newLevel > oldLevel) {
        toast.success(`🎉 LEVEL UP! You reached Level ${newLevel}: ${levelTitles[newLevel - 1]}!`, {
          duration: 5000,
        });
      } else {
        toast.success(`+${amount} XP — ${reason}`, {
          duration: 3000,
        });
      }

      return newXP;
    });

    setDailyXPEarned((prev) => prev + amount);
  };

  return (
    <GamificationContext.Provider
      value={{
        xp,
        level,
        levelTitle,
        streakDays,
        nextLevelXP,
        prevLevelXP,
        dailyXPEarned,
        badgesUnlocked,
        awardXP,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return context;
}
