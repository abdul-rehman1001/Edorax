import { shiftUtcDate } from "./streak.js";

/** One day in the streak popup's trailing week row. */
export type StreakPopupDayStatus = "completed" | "missed" | "today";

export type StreakPopupDay = {
  /** ISO calendar day "YYYY-MM-DD". */
  day: string;
  /** Single-letter weekday initial (UTC weekday of the day key). */
  weekday: string;
  status: StreakPopupDayStatus;
  /** Study seconds that day, when known. */
  seconds: number;
};

export type StreakPopupShouldShowInput = {
  /** Local day key the learner last dismissed the popup on, or null. */
  seenOn: string | null;
  /** Learner's local today as "YYYY-MM-DD". */
  today: string;
  streakCount: number;
  /** True when the learner already has learning activity today. */
  todayActive: boolean;
};

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** Whether the daily streak popup should open for this local day. */
export function shouldShowStreakPopup(input: StreakPopupShouldShowInput): boolean {
  if (input.seenOn === input.today) return false;
  return input.streakCount > 0 || input.todayActive;
}

/** Weekday initial for an ISO day key (UTC calendar day). */
export function weekdayInitial(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "?";
  return WEEKDAY_INITIALS[date.getUTCDay()] ?? "?";
}

/**
 * Trailing 7 local days ending on `today`. Past days without activity are missed;
 * active days are completed; today always uses the flame badge status.
 */
export function buildStreakWeek(input: {
  today: string;
  activeDays: Iterable<string>;
  secondsByDay?: ReadonlyMap<string, number> | Record<string, number>;
}): StreakPopupDay[] {
  const active = new Set(input.activeDays);
  const secondsOf = (day: string): number => {
    const source = input.secondsByDay;
    if (!source) return 0;
    if (source instanceof Map) return source.get(day) ?? 0;
    const record = source as Record<string, number>;
    return record[day] ?? 0;
  };

  const days: StreakPopupDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = shiftUtcDate(input.today, -offset);
    const seconds = secondsOf(day);
    const hasActivity = active.has(day) || seconds > 0;
    let status: StreakPopupDayStatus;
    if (day === input.today) status = "today";
    else if (hasActivity) status = "completed";
    else status = "missed";
    days.push({ day, weekday: weekdayInitial(day), status, seconds });
  }
  return days;
}

/** Short human summary for a tapped day. */
export function streakDaySummary(day: StreakPopupDay, today: string): string {
  if (day.day === today) {
    if (day.seconds > 0) return `Today · ${formatStudyMinutes(day.seconds)} so far`;
    return "Today is still open. Open a lesson to lock it in.";
  }
  if (day.status === "completed" || day.seconds > 0) {
    return `${formatDayLabel(day.day)} · ${formatStudyMinutes(day.seconds)}`;
  }
  return `${formatDayLabel(day.day)} · no study logged`;
}

function formatStudyMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes <= 0) return "under a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
