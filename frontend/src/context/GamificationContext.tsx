import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { DEMO_PREVIEW } from '../lib/features';

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

// What every consumer sees while the feature is off (no backend until Tier 3, roadmap §0).
const INERT: GamificationState = {
  xp: 0,
  level: 1,
  levelTitle: levelTitles[0],
  streakDays: 0,
  nextLevelXP: levelThresholds[1],
  prevLevelXP: 0,
  dailyXPEarned: 0,
  badgesUnlocked: [],
  awardXP: () => {},
};

// Demo values are only read, written or invented under VITE_DEMO_PREVIEW; a blocked or corrupt
// localStorage must never stop the app from rendering.
function readSavedXp(): number {
  if (!DEMO_PREVIEW) return 0;
  try {
    const saved = parseInt(localStorage.getItem('studyloop_xp') ?? '', 10);
    return Number.isFinite(saved) ? saved : 1420;
  } catch {
    return 1420;
  }
}

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [xp, setXp] = useState<number>(readSavedXp);

  const [streakDays] = useState(DEMO_PREVIEW ? 5 : 0);
  const [dailyXPEarned, setDailyXPEarned] = useState(DEMO_PREVIEW ? 65 : 0);
  const [badgesUnlocked] = useState<string[]>(
    DEMO_PREVIEW ? ['FIRST_VOICE_QUERY', 'STREAK_5_DAYS', 'ALGO_STARTER'] : []
  );

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
    if (!DEMO_PREVIEW) return;
    try {
      localStorage.setItem('studyloop_xp', xp.toString());
    } catch {
      /* private mode / blocked storage */
    }
  }, [xp]);

  const awardXP = (amount: number, reason: string) => {
    if (!DEMO_PREVIEW) return;
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
          id: `level-up-${newLevel}`,
          duration: 4000,
        });
      } else {
        // Use deduplicated toast ID to prevent rapid toast cluttering
        toast.success(`+${amount} XP — ${reason}`, {
          id: `xp-${reason.toLowerCase().replace(/\s+/g, '-')}`,
          duration: 2500,
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
    // Feature off: a consumer outside the provider just sees the zero state instead of crashing.
    if (!DEMO_PREVIEW) return INERT;
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return context;
}
