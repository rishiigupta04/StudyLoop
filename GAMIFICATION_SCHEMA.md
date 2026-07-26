# StudyLoop Gamification & XP System Architecture

## 1. Overview & XP Economy

StudyLoop implements a behavioral gamification system designed to drive active learning, recall consistency, and video engagement.

### XP Earnings Table

| Action | XP Awarded | Cap / Limit |
| :--- | :--- | :--- |
| **Complete 10 Mins Video Watch** | `+15 XP` | Max 150 XP/day |
| **Correct Active Recall Quiz Answer** | `+10 XP` | Max 50 XP/day |
| **100% Daily Quiz Completion Bonus** | `+50 XP` | 1x per day |
| **Voice Copilot Query (`~` Key)** | `+10 XP` | Max 50 XP/day |
| **Capture / Bookmark Timestamped Note** | `+5 XP` | Max 30 XP/day |
| **Daily Streak Maintenance** | `+50 XP × Streak Multiplier` | 1x per day |

---

## 2. Level Progression System

$$\text{Required XP for Level } N = 250 \times N^{1.4}$$

- **Level 1 — Novice Scholar**: 0 – 249 XP
- **Level 2 — Algorithmic Apprentice**: 250 – 749 XP
- **Level 3 — Deep Learner**: 750 – 1,499 XP
- **Level 4 — Synthesis Master**: 1,500 – 2,999 XP
- **Level 5 — StudyLoop Grandmaster**: 3,000+ XP

---

## 3. Database Schemas (PostgreSQL / Supabase RLS)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. USER GAMIFICATION PROFILE TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_gamification_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    total_xp INT NOT NULL DEFAULT 0,
    current_level INT NOT NULL DEFAULT 1,
    current_streak INT NOT NULL DEFAULT 1,
    longest_streak INT NOT NULL DEFAULT 1,
    last_activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX idx_gamification_xp ON public.user_gamification_profiles (total_xp DESC);
CREATE INDEX idx_gamification_streak ON public.user_gamification_profiles (current_streak DESC);

-- -----------------------------------------------------------------------------
-- 2. XP ACTIVITY LOGS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.xp_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'QUIZ_CORRECT', 'VOICE_QUERY', 'VIDEO_MILESTONE', 'NOTE_SAVED', 'STREAK_BONUS'
    xp_earned INT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_xp_logs_user ON public.xp_activity_logs (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. BADGES DEFINITION & UNLOCK TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_code VARCHAR(50) NOT NULL, -- 'FIRST_VOICE_QUERY', 'STREAK_7_DAYS', 'QUIZ_WHIZ_10', 'ALGO_MASTER'
    badge_name VARCHAR(100) NOT NULL,
    badge_icon VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_badge UNIQUE (user_id, badge_code)
);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_gamification_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own gamification profile"
    ON public.user_gamification_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can read own XP logs"
    ON public.xp_activity_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can read own badges"
    ON public.user_badges FOR SELECT
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. AUTOMATIC LEVEL UP FUNCTION & TRIGGER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_xp_addition()
RETURNS TRIGGER AS $$
DECLARE
    new_total INT;
    calc_level INT;
BEGIN
    -- Calculate new total XP
    SELECT COALESCE(SUM(xp_earned), 0) INTO new_total
    FROM public.xp_activity_logs
    WHERE user_id = NEW.user_id;

    -- Calculate level based on threshold formula
    IF new_total < 250 THEN calc_level := 1;
    ELSIF new_total < 750 THEN calc_level := 2;
    ELSIF new_total < 1500 THEN calc_level := 3;
    ELSIF new_total < 3000 THEN calc_level := 4;
    ELSE calc_level := 5;
    END IF;

    -- Update profile
    UPDATE public.user_gamification_profiles
    SET total_xp = new_total,
        current_level = calc_level,
        updated_at = NOW()
    WHERE user_id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_xp_logged
    AFTER INSERT ON public.xp_activity_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_xp_addition();
```
