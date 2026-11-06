// Wire contract for notifications: the in-app feed (/api/v1/notifications), the user's channel
// preferences, and the Server-Sent Events that push new notifications to the signed-in browser.
// Which channels each event uses is decided on the server (services/notifications/config.ts);
// this file only names the categories a person can switch on or off.

import type { MascotReaction } from "../engagement/reactions.js";

export const NOTIFICATION_CATEGORIES = ["activity", "course", "reminder", "account", "admin"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationCategoryInfo = {
  label: string;
  description: string;
  /** Channels the person may turn off. Account notices always arrive on both. */
  optional: { inApp: boolean; email: boolean };
};

export const NOTIFICATION_CATEGORY_INFO: Record<NotificationCategory, NotificationCategoryInfo> = {
  activity: {
    label: "Questions and reviews",
    description: "Replies to your questions, mentor feedback, and work waiting for your review.",
    optional: { inApp: true, email: true },
  },
  course: {
    label: "Courses",
    description: "Enrollments, new learners, and finished courses.",
    optional: { inApp: true, email: true },
  },
  reminder: {
    label: "Study reminders",
    description: "At most one nudge a day when you have been away: your courses, or a course to start next.",
    optional: { inApp: true, email: true },
  },
  account: {
    label: "Account",
    description: "Changes to your access. Always on.",
    optional: { inApp: false, email: false },
  },
  admin: {
    label: "Platform admin",
    description: "Instructor and organization requests waiting for an admin.",
    optional: { inApp: true, email: true },
  },
};

export const NOTIFICATION_TYPES = [
  "help.question",
  "help.reply",
  "help.resolved",
  "review.pending",
  "review.feedback",
  "enrollment.created",
  "enrollment.new_learner",
  "course.completed",
  "course.learner_completed",
  "study.reminder",
  "course.suggestion",
  "instructor.request",
  "instructor.decision",
  "instructor.granted",
  "admin.granted",
  "organization.course_request",
  "organization.course_approved",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationItem = {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  /** App-relative link the notification opens, e.g. `/my-questions/abc`. */
  url: string | null;
  courseId: string | null;
  readAt: string | null;
  createdAt: string;
  /** review.feedback only: what the mentor decided (absent on notifications sent before it was stored). */
  verdict?: "APPROVED" | "NEEDS_REVISION";
  /** Live pushes only: what the messenger mascot says about this notification, when it has words for it. */
  reaction?: MascotReaction;
};

export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  nextCursor: string | null;
};

export type NotificationReadResult = { unreadCount: number };

export type NotificationPreferences = {
  email: Record<NotificationCategory, boolean>;
  inApp: Record<NotificationCategory, boolean>;
};

export type NotificationPreferencesUpdate = {
  email?: Partial<Record<NotificationCategory, boolean>>;
  inApp?: Partial<Record<NotificationCategory, boolean>>;
};

// --- Realtime (Server-Sent Events) ------------------------------------------------------------

/**
 * SSE stream of the signed-in user's notification events (GET, `text/event-stream`). Served under
 * /api/v1, so the Next.js proxy forwards it like any other API call. Browsers authenticate with
 * `?ticket=` (EventSource cannot send headers); API clients may use the cookie or a Bearer token.
 */
export const NOTIFICATION_STREAM_PATH = "/api/v1/notifications/stream";

/** SSE `event:` names. Each message's `data:` is the JSON payload typed below. */
export const REALTIME_EVENTS = {
  /** Server → client: a notification was created for this user. */
  notificationNew: "notification:new",
  /** Server → client: notifications were marked read (possibly in another tab). */
  notificationRead: "notification:read",
} as const;

export type NotificationNewEvent = { notification: NotificationItem; unreadCount: number };
export type NotificationReadEvent = { ids: string[] | "all"; unreadCount: number };

/** Short-lived credential for opening the notification stream (`?ticket=`). */
export type RealtimeTicket = { token: string; expiresAt: string };
