import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { CareerProgress, CareerTier } from "../../shared/api/gamification.js";
import {
  CAREER_REQUIREMENTS,
  CAREER_TIERS,
  CAREER_TIER_LABELS,
  careerTierForMastery,
  careerTierIndex,
  nextCareerTier,
  type CareerMastery,
} from "../../shared/gamification/career.js";

// The permanent career ladder. It is derived on read from verified progress (completed courses and
// average chapter score), never from raw XP, and the highest tier ever reached is stored on
// `User.careerTier` so a later dip in the average score can never demote someone.

type Db = Prisma.TransactionClient | typeof prisma;

async function computeCareerMastery(db: Db, userId: string): Promise<CareerMastery> {
  const [completedCourses, scores] = await Promise.all([
    // A course counts as mastered when it is content-complete (status COMPLETED, percentComplete 100)
    // — the same signal the course_completed XP/credit hook uses. `lifecycle` is a separate concept
    // that stays ACTIVE for a finished course, so it must not gate the career.
    db.enrollment.count({
      where: { userId, status: "COMPLETED" },
    }),
    db.chapterProgress.findMany({
      where: {
        enrollment: { userId, status: "COMPLETED" },
        status: "COMPLETED",
        maxScore: { gt: 0 },
      },
      select: { score: true, maxScore: true },
    }),
  ]);
  const avgScore = scores.length === 0 ? 0 : (scores.reduce((sum, row) => sum + row.score / row.maxScore, 0) / scores.length) * 100;
  return { completedCourses, avgScore };
}

/**
 * The learner's career tier (highest ever, never demoted) and progress toward the next tier. Reads
 * are idempotent: if mastery now qualifies for a higher tier, it is stored and returned; otherwise
 * the stored best tier stands.
 */
export async function loadCareerProgress(userId: string, db: Db = prisma): Promise<CareerProgress> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { careerTier: true } });
  const stored = user?.careerTier ?? "INTERN";
  const mastery = await computeCareerMastery(db, userId);
  const qualified = careerTierForMastery(mastery);
  const tier: CareerTier = careerTierIndex(qualified) > careerTierIndex(stored) ? qualified : stored;

  if (tier !== stored) {
    await db.user.update({ where: { id: userId }, data: { careerTier: tier } });
  }

  const index = careerTierIndex(tier);
  const next = nextCareerTier(tier);
  const requirement = next ? CAREER_REQUIREMENTS[next] : null;

  let percent = 100;
  if (next && requirement) {
    const coursePct = Math.min(100, (mastery.completedCourses / Math.max(1, requirement.courses)) * 100);
    const scorePct = requirement.minScore > 0 ? Math.min(100, (mastery.avgScore / requirement.minScore) * 100) : 100;
    percent = Math.min(100, Math.round((coursePct + scorePct) / 2));
  }

  return {
    tier,
    title: CAREER_TIER_LABELS[tier],
    nextTier: next,
    nextTitle: next ? CAREER_TIER_LABELS[next] : null,
    totalTiers: CAREER_TIERS.length,
    tierIndex: index + 1,
    completedCourses: mastery.completedCourses,
    avgScore: Math.round(mastery.avgScore),
    requiredForNext: requirement,
    percent,
  };
}