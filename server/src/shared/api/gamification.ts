import type { LevelProgress } from "../gamification/levels.js";

// Wire contract for XP, levels, streak freezes and leaderboards (/api/v1/learner/gamification and
// /api/v1/learner/leaderboard). Each feature has its own server flag; a switched-off feature comes
// back as null (or status "disabled"), so clients never show half a feature.

export type { LevelProgress };

export type GamificationFeatures = {
  xp: boolean;
  streakFreezes: boolean;
  /** Levels and module stages. Needs XP. */
  levels: boolean;
  /** The permanent mastery-gated career ladder (Intern → Principal). Needs XP. */
  career: boolean;
  /** Build Credits: a spendable cosmetic currency. Needs XP. */
  credits: boolean;
  /** Needs XP. */
  leaderboards: boolean;
};

export type StreakFreezeSummary = {
  available: number;
  max: number;
  /** Learner-local days a freeze covered in the last two weeks, newest first. */
  recentlyCoveredDays: string[];
};

export type GamificationSummary = {
  features: GamificationFeatures;
  /** The learner chose "hide game elements"; clients show none of the parts below. */
  hidden: boolean;
  leaderboardOptIn: boolean;
  xp: { total: number; thisWeek: number } | null;
  level: LevelProgress | null;
  /** The permanent career tier (highest reached, never demotes); null when the feature is off. */
  career: CareerProgress | null;
  /** Spendable build-credit balance; null when the feature is off. */
  credits: { balance: number } | null;
  freezes: StreakFreezeSummary | null;
  /** Finished weekly boards the learner ended in the top three; null when leaderboards are off or there are none. */
  topThree: TopThreeFinishes | null;
};

export type CareerTier = "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "STAFF" | "PRINCIPAL";

export type CareerRequirement = {
  /** Completed courses needed for the next tier. */
  courses: number;
  /** Minimum average quiz score (0–100) needed for the next tier. */
  minScore: number;
};

export type CareerProgress = {
  tier: CareerTier;
  title: string;
  nextTier: CareerTier | null;
  nextTitle: string | null;
  totalTiers: number;
  /** 1-based position (Intern = 1). */
  tierIndex: number;
  completedCourses: number;
  /** Average weighted chapter score, 0–100. */
  avgScore: number;
  requiredForNext: CareerRequirement | null;
  /** 0–100 progress toward the next tier. */
  percent: number;
};

export type TopThreeFinishes = {
  count: number;
  /** The most recent finish. */
  latest: { rank: number; courseTitle: string; weekStart: string };
};

export type GamificationPreferencesInput = {
  hidden?: boolean;
  leaderboardOptIn?: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  /** First name and last initial; "You" is the client's job. */
  name: string;
  xp: number;
  isYou: boolean;
};

export type LeaderboardView =
  | { status: "disabled" }
  | { status: "opt_in_required"; courseId: string; courseTitle: string }
  | { status: "unavailable"; reason: "organization_disabled" | "not_active"; courseId: string; courseTitle: string }
  | {
      status: "ready";
      courseId: string;
      courseTitle: string;
      /** Monday (UTC) of the current week; boards reset every Monday 00:00 UTC. */
      weekStart: string;
      resetsAt: string;
      groupSize: number;
      you: { rank: number; xp: number; bestWeekXp: number };
      /** The learner and up to three people either side of them. */
      entries: LeaderboardEntry[];
      /** Last week's top three on this board (only people who scored), or null when there were none. */
      lastWeek: { weekStart: string; winners: LeaderboardEntry[] } | null;
    };

export const LEADERBOARD_NEIGHBOURS = 3;

// === Leaderboard hub ===
//
// The redesigned leaderboard page serves several boards from one endpoint: the weekly course
// board (delegated to the code above), a global weekly XP league, and three recognition boards
// (all-time XP, speed, streak). The hub view is a separate contract from `LeaderboardView` so
// the established per-course board keeps its exact shape.

export type LeaderboardCategory = "weekly_xp" | "all_time_xp" | "speed" | "streak";
export type LeaderboardScope = "course" | "global";

export type LeagueTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "DIAMOND";
export type LeagueOutcome = "PROMOTED" | "DEMOTED" | "HELD";

/** Tiers from lowest to highest; the hub UI uses this order for badges and arrows. */
export const LEAGUE_TIERS: LeagueTier[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];

export type LeaderboardHubEntry = {
  rank: number;
  /** First name and last initial; "You" is the client's job. */
  name: string;
  /** The category's score: XP, chapters completed, or streak days. */
  score: number;
  isYou: boolean;
  /** The learner's current league tier, when league membership applies. */
  tier?: LeagueTier;
  avatarUrl?: string | null;
};

export type LeagueInfo = {
  tier: LeagueTier;
  nextTier: LeagueTier | null;
  prevTier: LeagueTier | null;
  /** The learner's rank within their own tier this week. */
  rank: number;
  /** How many learners are in this tier's board. */
  groupSize: number;
  /** Rank at or better than this promotes at the Monday reset. */
  promotionZone: number;
  /** Rank at or worse than this demotes at the Monday reset. */
  demotionZone: number;
  /** The settled outcome of the week that just closed, when there was one. */
  lastWeek: { outcome: LeagueOutcome; fromTier: LeagueTier } | null;
};

export type LeaderboardHubView =
  | { status: "disabled"; category: LeaderboardCategory; scope: LeaderboardScope }
  | {
      status: "opt_in_required";
      category: LeaderboardCategory;
      scope: LeaderboardScope;
      courseId: string | null;
      courseTitle: string | null;
    }
  | {
      status: "unavailable";
      reason: "organization_disabled" | "not_active" | "no_courses";
      category: LeaderboardCategory;
      scope: LeaderboardScope;
      courseId: string | null;
      courseTitle: string | null;
    }
  | {
      status: "ready";
      category: LeaderboardCategory;
      scope: LeaderboardScope;
      courseId: string | null;
      courseTitle: string | null;
      /** How to label scores in the UI: "XP", "chapters" or "day streak". */
      metricLabel: string;
      /** Monday (UTC) of the current board week; null when the board never resets. */
      weekStart: string | null;
      resetsAt: string | null;
      groupSize: number;
      you: { rank: number; score: number; bestScore: number | null };
      /** The learner and up to three people either side of them. */
      entries: LeaderboardHubEntry[];
      /** Last week's top three, when the board has a weekly reset; null otherwise. */
      lastWeek: { weekStart: string; winners: LeaderboardHubEntry[] } | null;
      /** League state, only on the global weekly XP board. */
      league: LeagueInfo | null;
    };

export const LEADERBOARD_HUB_NEIGHBOURS = 3;
