// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { MessageReceivedFacts, RecordedEngagementEvent } from "../api/engagement";
import type { NotificationItem } from "../api/notifications";

// Live notifications the messenger mascot announces to a learner. The notification already came
// from the server over the signed-in stream, so it is turned into a local `message_received` event
// and run through the rules (engine.react) without being reported again.

/** What the messenger says about a notification, or null for notifications it leaves to the bell. */
export function messageKindFor(item: Pick<NotificationItem, "type" | "verdict">): MessageReceivedFacts["kind"] | null {
  switch (item.type) {
    case "help.reply":
      return "reply";
    case "help.resolved":
      return "resolved";
    case "review.feedback":
      return item.verdict === "APPROVED" ? "approved" : "feedback";
    default:
      return null;
  }
}

/** The local event for a live notification the messenger announces, or null. */
export function messageEventFor(item: NotificationItem): RecordedEngagementEvent | null {
  const kind = messageKindFor(item);
  if (!kind) return null;
  return {
    id: `notification:${item.id}`,
    type: "message_received",
    courseId: item.courseId,
    chapterId: null,
    isNew: true,
    createdAt: item.createdAt,
    payload: { kind, url: item.url },
  };
}
