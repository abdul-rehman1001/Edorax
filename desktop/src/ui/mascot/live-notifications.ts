import type { NotificationItem } from '../../../../server/src/shared/api/notifications';

// Live notifications on their way to the mascot, under the web's rules
// (frontend/src/lib/notifications/notification-store.ts): each one once, never a stale one, and a
// push that lands while the window is hidden waits until it is visible again.

/** A push older than this was delivered late. */
const MAX_AGE_MS = 60_000;
/** A push held while the window was hidden still counts on return if it is this fresh. */
const HELD_MAX_AGE_MS = 5 * 60_000;

export function createLiveNotifications(
  listener: (item: NotificationItem) => void,
  isVisible: () => boolean,
  now: () => number = Date.now,
) {
  const seen = new Set<string>();
  let held: NotificationItem[] = [];
  const age = (item: NotificationItem) =>
    now() - new Date(item.createdAt).getTime();
  return {
    receive(item: NotificationItem) {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      if (age(item) >= MAX_AGE_MS) return;
      if (isVisible()) listener(item);
      else held.push(item);
    },
    /** Call when the window becomes visible. */
    flush() {
      if (!isVisible()) return;
      const waiting = held;
      held = [];
      for (const item of waiting)
        if (age(item) < HELD_MAX_AGE_MS) listener(item);
    },
  };
}
