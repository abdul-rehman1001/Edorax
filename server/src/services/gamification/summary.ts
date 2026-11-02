import { prisma } from "../../db/prisma.js";
import type { GamificationPreferencesInput, GamificationSummary } from "../../shared/api/gamification.js";
import { levelProgress } from "../../shared/gamification/levels.js";
import { dateToDayKey, dayKeyToDate, localDayKey, shiftDayKey } from "../../shared/lib/local-date.js";
import { MAX_STREAK_FREEZES } from "../../shared/lib/streak.js";
import { learnerTimeZone } from "../learner/time-zone.js";
import { gamificationFeatures } from "./flags.js";
import { currentLeaderboardWeek, leaveCurrentBoards, loadTopThreeFinishes } from "./leaderboard.js";
import { loadCareerProgress } from "./career.js";
import { creditBalance } from "./credits.js";

/** What the learner's dashboard shows for XP, level and freezes. Switched-off parts are null. */
export async function loadGamificationSummary(userId: string, now: Date = new Date()): Promise<GamificationSummary> {
  const features = gamificationFeatures();
  const [user, timeZone] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { xpTotal: true, streakFreezes: true, gamificationHidden: true, leaderboardOptIn: true },
    }),
    learnerTimeZone(userId),
  ]);
  const twoWeeksAgo = shiftDayKey(localDayKey(now, timeZone), -13);
  const [week, covered, topThree] = await Promise.all([
    features.xp
      ? prisma.xpEntry.aggregate({ where: { userId, weekKey: currentLeaderboardWeek(now) }, _sum: { amount: true } })
      : null,
    features.streakFreezes
      ? prisma.streakFreezeDay.findMany({
          where: { userId, date: { gte: dayKeyToDate(twoWeeksAgo) } },
          orderBy: { date: "desc" },
          select: { date: true },
        })
      : [],
    features.leaderboards ? loadTopThreeFinishes(userId, now) : null,
  ]);

  const total = Math.max(0, user?.xpTotal ?? 0);
  const career = features.career ? await loadCareerProgress(userId) : null;
  const credits = features.credits ? { balance: await creditBalance(userId) } : null;
  return {
    features,
    hidden: user?.gamificationHidden ?? false,
    leaderboardOptIn: user?.leaderboardOptIn ?? false,
    xp: features.xp ? { total, thisWeek: Math.max(0, week?._sum.amount ?? 0) } : null,
    level: features.levels ? levelProgress(total) : null,
    career,
    credits,
    freezes: features.streakFreezes
      ? {
          available: Math.min(MAX_STREAK_FREEZES, Math.max(0, user?.streakFreezes ?? 0)),
          max: MAX_STREAK_FREEZES,
          recentlyCoveredDays: covered.map((row) => dateToDayKey(row.date)),
        }
      : null,
    topThree,
  };
}

export async function updateGamificationPreferences(userId: string, input: GamificationPreferencesInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.hidden !== undefined ? { gamificationHidden: input.hidden } : {}),
        ...(input.leaderboardOptIn !== undefined ? { leaderboardOptIn: input.leaderboardOptIn } : {}),
      },
    });
    if (input.hidden === true || input.leaderboardOptIn === false) await leaveCurrentBoards(tx, userId);
  });
}
