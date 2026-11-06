import type { EngagementTrackInput } from "@/shared/engagement/engine";

export { isReadingPath, pageAreaFor } from "@buildment/learning-ui/mascot/paths";

// Some moments end in a server-side redirect (enrolling), so no client code is running to report
// them. The server action leaves this short-lived cookie instead, and the mascot player reports it
// on the next page. Plain module: imported by server actions and by the browser.

export const PENDING_ENGAGEMENT_COOKIE = "buildment_engagement_pending";
export const PENDING_ENGAGEMENT_MAX_AGE_SECONDS = 120;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function formatPendingEnrollment(courseId: string): string | null {
  return ID.test(courseId) ? `enrolled.${courseId}` : null;
}

/** The event a pending cookie value names, or null for anything unexpected. */
export function parsePendingEngagement(value: string | null | undefined): EngagementTrackInput | null {
  if (!value) return null;
  const [type, courseId, ...rest] = decodeURIComponent(value).split(".");
  if (type !== "enrolled" || !courseId || rest.length > 0 || !ID.test(courseId)) return null;
  return { type: "enrolled", courseId };
}

/** Reads the pending event from a `document.cookie` string. */
export function readPendingEngagementCookie(cookieHeader: string): EngagementTrackInput | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === PENDING_ENGAGEMENT_COOKIE) return parsePendingEngagement(value.join("="));
  }
  return null;
}
