import type { Prisma } from "../../generated/prisma/index.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import type { RecordedEngagementEvent, TrackEventResult } from "../../shared/api/engagement.js";
import type { NotificationItem } from "../../shared/api/notifications.js";
import type { PageArea } from "../../shared/engagement/mascots.js";
import { messageEventFor } from "../../shared/engagement/messages.js";
import { decideReaction, type MascotReaction } from "../../shared/engagement/reactions.js";
import { matchingRules } from "../../shared/engagement/rules.js";
import { logger } from "../../utils/logger.js";

// The mascot's decisions, made here so the web, desktop and mobile apps all show the same reaction
// and a new rule or line needs no app release (docs/13-engagement.mdx). A mascot is never worth
// failing the action for, so a problem here is logged and the app is left to decide for itself.
//
// Cooldowns hold across devices: the event a reaction answered is stamped with its rule, and a rule
// is cooling down while a stamped event of the user's is recent. Two devices racing can both react
// once, which is harmless and not worth a lock.

const voiceOrigin = () => env.MASCOT_ASSET_BASE_URL ?? env.APP_URL;

async function rulesCoolingDown(userId: string, events: readonly RecordedEngagementEvent[], now: Date): Promise<Set<string>> {
  const cooling = new Set<string>();
  for (const rule of matchingRules(events)) {
    if (!rule.cooldownMs) continue;
    const recent = await prisma.engagementEvent.findFirst({
      where: {
        userId,
        createdAt: { gte: new Date(now.getTime() - rule.cooldownMs) },
        payload: { path: ["reactedRule"], equals: rule.id },
      },
      select: { id: true },
    });
    if (recent) cooling.add(rule.id);
  }
  return cooling;
}

/** Adds the mascot's decision to a tracked moment; on any problem the result goes out without one. */
export async function withReaction(
  userId: string,
  result: TrackEventResult,
  context: { reading?: boolean; area?: PageArea },
  now: Date
): Promise<TrackEventResult> {
  if (!env.MASCOT_SERVER_REACTIONS) return result;
  try {
    const cooling = await rulesCoolingDown(userId, result.events, now);
    const decision = decideReaction(result.events, {
      rewards: result.rewards,
      reading: context.reading ?? false,
      area: context.area ?? null,
      coolingDown: (rule) => cooling.has(rule.id),
      pickLine: (rule) => Math.floor(Math.random() * rule.messages.length),
      assetBase: voiceOrigin(),
    });
    if (decision?.rule.cooldownMs && decision.event) {
      await prisma.engagementEvent.update({
        where: { id: decision.event.id },
        data: { payload: { ...decision.event.payload, reactedRule: decision.rule.id } as Prisma.InputJsonObject },
      });
    }
    return { ...result, reaction: decision?.reaction ?? null };
  } catch (error) {
    logger.warn({ err: error, userId }, "mascot reaction skipped");
    return result;
  }
}

/** The messenger's reaction to a live notification, or undefined when it leaves it to the bell. */
export function reactionForNotification(item: NotificationItem): MascotReaction | undefined {
  if (!env.MASCOT_SERVER_REACTIONS) return undefined;
  const event = messageEventFor(item);
  return (event && decideReaction([event], { assetBase: voiceOrigin() })?.reaction) ?? undefined;
}
