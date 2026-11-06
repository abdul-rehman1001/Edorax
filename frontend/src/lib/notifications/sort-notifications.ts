import type { NotificationItem } from "@/shared/api/notifications";

/** Keep the notification inbox in strict newest-to-oldest time order. */
export function sortNotificationsForInbox(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => {
    const timeDifference = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (timeDifference) return timeDifference;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
