import type { Notification, Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_INFO,
  REALTIME_EVENTS,
  type NotificationCategory,
  type NotificationFeed,
  type NotificationItem,
  type NotificationNewEvent,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
  type NotificationReadEvent,
  type NotificationType,
} from "../../shared/api/notifications.js";
import { reactionForNotification } from "../engagement/reactions.js";
import { NOTIFICATION_CHANNELS, channelEnabled } from "./config.js";
import { emitToUser } from "./realtime.js";
import { signalEmailQueued, withPreferencesFooter, type EmailContent } from "./email-outbox.js";

// Central notification flow. Every product event calls notify(); it applies the channel table in
// config.ts and the recipient's preferences, stores the in-app row (the bell), queues email for the
// background worker, and pushes the new row to the user's open tabs over Server-Sent Events.
//
// Duplicate protection: `dedupeKey` names the event. In-app rows are unique per (user, key) and
// email rows per (key, address), both inserted with ON CONFLICT DO NOTHING — so a retried request,
// a double click or a re-run job never notifies twice, and the insert is safe inside a caller's
// transaction (it cannot abort it).

export type NotificationRecipient = { userId: string } | { email: string; name?: string | null };
export type { EmailContent };

export type NotifyInput = {
  type: NotificationType;
  recipients: NotificationRecipient[];
  dedupeKey: string;
  title: string;
  body: string;
  url?: string | null;
  courseId?: string | null;
  data?: Prisma.InputJsonValue;
  /** Rendered once per email recipient. Omit for in-app-only events. */
  email?: (recipient: { name: string | null; email: string }) => EmailContent | Promise<EmailContent>;
};

export type NotifyResult = { inApp: number; emails: number };

type Db = Prisma.TransactionClient;

/**
 * Notifies every recipient of one event. Pass `tx` to write inside the caller's transaction (the
 * rows commit or roll back with it, and the worker pushes them live after commit); without it the
 * push happens immediately.
 */
export async function notify(input: NotifyInput, options: { tx?: Db } = {}): Promise<NotifyResult> {
  const db: Db = options.tx ?? prisma;
  const config = NOTIFICATION_CHANNELS[input.type];

  const userIds = [...new Set(input.recipients.flatMap((r) => ("userId" in r ? [r.userId] : [])))];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          name: true,
          notificationPreference: { select: { emailOptOut: true, inAppOptOut: true } },
        },
      })
    : [];

  const inAppUsers = users.filter((user) => channelEnabled(input.type, "inApp", user.notificationPreference));
  const created = inAppUsers.length
    ? await db.notification.createManyAndReturn({
        data: inAppUsers.map((user) => ({
          userId: user.id,
          type: input.type,
          category: config.category,
          title: input.title,
          body: input.body,
          url: input.url ?? null,
          courseId: input.courseId ?? null,
          data: input.data,
          dedupeKey: input.dedupeKey,
          pushedAt: options.tx ? null : new Date(),
        })),
        skipDuplicates: true,
      })
    : [];

  let emails = 0;
  if (config.email && input.email) {
    const seen = new Set<string>();
    const targets: { userId: string | null; email: string; name: string | null }[] = [];
    for (const user of users) {
      if (!channelEnabled(input.type, "email", user.notificationPreference)) continue;
      targets.push({ userId: user.id, email: user.email, name: user.name });
    }
    for (const recipient of input.recipients) {
      if ("email" in recipient) targets.push({ userId: null, email: recipient.email, name: recipient.name ?? null });
    }

    const rows: Prisma.EmailOutboxCreateManyInput[] = [];
    for (const target of targets) {
      const address = target.email.trim().toLowerCase();
      if (!address.includes("@") || seen.has(address)) continue;
      seen.add(address);
      const rendered = await input.email({ name: target.name, email: address });
      const footer = target.userId !== null && NOTIFICATION_CATEGORY_INFO[config.category].optional.email;
      const content = footer ? withPreferencesFooter(rendered) : rendered;
      rows.push({
        userId: target.userId,
        notificationId: created.find((row) => row.userId === target.userId)?.id ?? null,
        type: input.type,
        category: config.category,
        toEmail: address,
        subject: content.subject,
        html: content.html,
        text: content.text,
        dedupeKey: `${input.dedupeKey}:${address}`,
      });
    }
    if (rows.length) emails = (await db.emailOutbox.createMany({ data: rows, skipDuplicates: true })).count;
  }

  if (!options.tx) {
    await pushNotifications(created);
    if (emails > 0) signalEmailQueued();
  }
  return { inApp: created.length, emails };
}

/**
 * Runs a notification task without letting it fail the caller. Use after the main write has
 * committed: the user's action already succeeded, so a notification problem is logged, not thrown.
 */
export async function dispatchNotification(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error({ err: error }, "[notifications] dispatch failed");
  }
}

// --- Live push --------------------------------------------------------------------------------

export function toNotificationItem(row: Notification): NotificationItem {
  const verdict = (row.data as { verdict?: unknown } | null)?.verdict;
  return {
    id: row.id,
    type: row.type as NotificationType,
    category: row.category as NotificationCategory,
    title: row.title,
    body: row.body,
    url: row.url,
    courseId: row.courseId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    ...(verdict === "APPROVED" || verdict === "NEEDS_REVISION" ? { verdict } : {}),
  };
}

async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Emits each row to its owner's open connections, with the owner's fresh unread count. */
export async function pushNotifications(rows: Notification[]): Promise<void> {
  const byUser = new Map<string, Notification[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  for (const [userId, userRows] of byUser) {
    const count = await unreadCount(userId);
    for (const row of userRows) {
      const notification = toNotificationItem(row);
      const reaction = reactionForNotification(notification);
      const event: NotificationNewEvent = {
        notification: reaction ? { ...notification, reaction } : notification,
        unreadCount: count,
      };
      emitToUser(userId, REALTIME_EVENTS.notificationNew, event);
    }
  }
}

/**
 * Pushes rows that were written inside another transaction (pushedAt null) once they are visible.
 * Called by the worker; claims rows by setting pushedAt first, so two workers never push one row.
 */
export async function relayUnpushedNotifications(now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const pending = await prisma.notification.findMany({
    where: { pushedAt: null, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true },
  });
  if (pending.length === 0) return 0;

  const ids = pending.map((row) => row.id);
  const claimed = await prisma.notification.updateManyAndReturn({
    where: { id: { in: ids }, pushedAt: null },
    data: { pushedAt: now },
  });
  await pushNotifications(claimed);
  return claimed.length;
}

// --- Feed and read state ----------------------------------------------------------------------

export async function listNotifications(
  userId: string,
  input: { limit: number; cursor?: string; unreadOnly?: boolean }
): Promise<NotificationFeed> {
  const where: Prisma.NotificationWhereInput = { userId, ...(input.unreadOnly ? { readAt: null } : {}) };
  const cursorRow = input.cursor
    ? await prisma.notification.findFirst({ where: { id: input.cursor, userId }, select: { id: true } })
    : null;

  const [rows, count] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(cursorRow ? { cursor: { id: cursorRow.id }, skip: 1 } : {}),
    }),
    unreadCount(userId),
  ]);

  const page = rows.slice(0, input.limit);
  return {
    items: page.map(toNotificationItem),
    unreadCount: count,
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<{ unreadCount: number }> {
  const row = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } });
  if (!row) throw new NotFoundError("Notification not found");

  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  const remaining = await unreadCount(userId);
  if (count > 0) {
    const event: NotificationReadEvent = { ids: [notificationId], unreadCount: remaining };
    emitToUser(userId, REALTIME_EVENTS.notificationRead, event);
  }
  return { unreadCount: remaining };
}

export async function markAllNotificationsRead(userId: string): Promise<{ unreadCount: number }> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (count > 0) {
    const event: NotificationReadEvent = { ids: "all", unreadCount: 0 };
    emitToUser(userId, REALTIME_EVENTS.notificationRead, event);
  }
  return { unreadCount: 0 };
}

// --- Preferences ------------------------------------------------------------------------------

function toPreferences(row: { emailOptOut: string[]; inAppOptOut: string[] } | null): NotificationPreferences {
  const build = (optOut: string[], channel: "email" | "inApp") =>
    Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((category) => [
        category,
        !NOTIFICATION_CATEGORY_INFO[category].optional[channel] || !optOut.includes(category),
      ])
    ) as Record<NotificationCategory, boolean>;
  return { email: build(row?.emailOptOut ?? [], "email"), inApp: build(row?.inAppOptOut ?? [], "inApp") };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  return toPreferences(row);
}

export async function updateNotificationPreferences(
  userId: string,
  update: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const current = await prisma.notificationPreference.findUnique({ where: { userId } });
  const apply = (optOut: string[], changes: NotificationPreferencesUpdate["email"], channel: "email" | "inApp") => {
    const next = new Set(optOut);
    for (const [category, enabled] of Object.entries(changes ?? {}) as [NotificationCategory, boolean][]) {
      // Mandatory categories cannot be switched off; ignore rather than reject so a stale form still saves.
      if (!NOTIFICATION_CATEGORY_INFO[category].optional[channel]) continue;
      if (enabled) next.delete(category);
      else next.add(category);
    }
    return [...next].sort();
  };

  const emailOptOut = apply(current?.emailOptOut ?? [], update.email, "email");
  const inAppOptOut = apply(current?.inAppOptOut ?? [], update.inApp, "inApp");
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, emailOptOut, inAppOptOut },
    update: { emailOptOut, inAppOptOut },
  });
  return toPreferences(row);
}
