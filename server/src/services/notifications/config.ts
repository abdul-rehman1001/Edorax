import {
  NOTIFICATION_CATEGORY_INFO,
  type NotificationCategory,
  type NotificationType,
} from "../../shared/api/notifications.js";

// The one place that decides how each product event reaches people. Every event goes through
// notify() in service.ts, which reads this table; call sites never pick channels themselves.
// A person's preferences can switch off an optional channel per category, never add one.

export type ChannelConfig = {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
};

export const NOTIFICATION_CHANNELS: Record<NotificationType, ChannelConfig> = {
  // Questions and reviews
  "help.question": { category: "activity", inApp: true, email: true },
  "help.reply": { category: "activity", inApp: true, email: true },
  "help.resolved": { category: "activity", inApp: true, email: true },
  "review.pending": { category: "activity", inApp: true, email: true },
  "review.feedback": { category: "activity", inApp: true, email: true },

  // Course lifecycle
  "enrollment.created": { category: "course", inApp: true, email: true },
  "enrollment.new_learner": { category: "course", inApp: true, email: true },
  "course.completed": { category: "course", inApp: true, email: true },
  "course.learner_completed": { category: "course", inApp: true, email: false },
  "course.curriculum_updated": { category: "course", inApp: true, email: true },
  "organization.course_approved": { category: "course", inApp: true, email: true },

  // Routine reminders (grouped per user and rate-limited in reminders.ts)
  "study.reminder": { category: "reminder", inApp: true, email: true },
  "course.suggestion": { category: "reminder", inApp: true, email: true },

  // Account
  "instructor.decision": { category: "account", inApp: true, email: true },
  "instructor.granted": { category: "account", inApp: true, email: true },
  "admin.granted": { category: "account", inApp: true, email: true },

  // Platform admin queues
  "instructor.request": { category: "admin", inApp: true, email: true },
  "organization.course_request": { category: "admin", inApp: true, email: true },
};

type Preference = { emailOptOut: string[]; inAppOptOut: string[] } | null | undefined;

/** Whether a user receives `type` on `channel`, after their preferences. */
export function channelEnabled(type: NotificationType, channel: "inApp" | "email", preference: Preference): boolean {
  const config = NOTIFICATION_CHANNELS[type];
  if (!config[channel]) return false;
  if (!NOTIFICATION_CATEGORY_INFO[config.category].optional[channel]) return true;
  const optOut = channel === "email" ? preference?.emailOptOut : preference?.inAppOptOut;
  return !(optOut ?? []).includes(config.category);
}
