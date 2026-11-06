import { browserMascotParts } from "@buildment/learning-ui/mascot/browser";
import { createMascotRuntime } from "@buildment/learning-ui/mascot/runtime";
import { apiFetch } from "@/lib/api-client";
import type { TrackEventResult } from "@/shared/api/engagement";
import type { EngagementTrackInput } from "@/shared/engagement/engine";
import { PENDING_ENGAGEMENT_COOKIE, readPendingEngagementCookie } from "@/lib/engagement/pending-event";
import { onNotificationToast } from "@/lib/notifications/notification-store";

// The web's adapter for the shared mascot runtime (packages/learning-ui/src/mascot/runtime.ts): the
// API transport and the live notification feed. Components call trackEngagement() after their own
// action succeeded and never wait on it.

const runtime = createMascotRuntime({
  platform: "web",
  send: (request) => apiFetch<TrackEventResult>("/api/v1/events", { method: "POST", json: request }),
  ...browserMascotParts(() => window.location.pathname),
  onNotification: onNotificationToast,
  onError: (error) => {
    if (process.env.NODE_ENV !== "production") console.debug("[engagement] event not tracked", error);
  },
});

/** Reports a learning moment. Fire-and-forget: it never throws and nothing should await it. */
export function trackEngagement(input: EngagementTrackInput): void {
  if (typeof window === "undefined") return;
  runtime.track(input);
}

export const subscribeToMascotReactions = runtime.subscribe;
export const announceMessages = runtime.announceMessages;
/** True when the messenger mascot shows this notification, so the toast can stand down. */
export const mascotAnnounces = runtime.announces;
export const startStudyStretchClock = runtime.startStudyClock;

/**
 * Offers a mentor once the learner has spent a long while on this unfinished chapter. Returns a
 * release function for when the chapter unmounts.
 */
export function watchChapterLingering(chapterId: string, estimatedMinutes: number | null | undefined): () => void {
  if (typeof window === "undefined") return () => undefined;
  return runtime.watchChapter(chapterId, estimatedMinutes);
}

/** Once per browser tab: reports the session start. */
export function startEngagementSession(): void {
  if (typeof window === "undefined") return;
  runtime.startSession();
}

/**
 * Reports a moment a server redirect left behind (see pending-event.ts). Call it on every
 * navigation: a server action's redirect is a client-side navigation, so the mascot player that
 * reads the cookie stays mounted and would otherwise never see it.
 */
export function reportPendingEngagement(): void {
  if (typeof window === "undefined") return;
  const pending = readPendingEngagementCookie(document.cookie);
  if (pending) {
    document.cookie = `${PENDING_ENGAGEMENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    trackEngagement(pending);
  }
}
