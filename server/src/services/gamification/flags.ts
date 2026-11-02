import { env } from "../../config/env.js";
import type { GamificationFeatures } from "../../shared/api/gamification.js";

/** The switched-on features. Read on every call so a test or an operator can flip them at runtime. */
export function gamificationFeatures(): GamificationFeatures {
  const xp = env.GAMIFICATION_XP;
  return {
    xp,
    streakFreezes: env.GAMIFICATION_STREAK_FREEZES,
    levels: xp && env.GAMIFICATION_LEVELS,
    career: xp && env.GAMIFICATION_CAREER_LEVELS,
    credits: xp && env.GAMIFICATION_CREDITS,
    leaderboards: xp && env.GAMIFICATION_LEADERBOARDS,
  };
}
