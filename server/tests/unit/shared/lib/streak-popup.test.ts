import { describe, expect, it } from "vitest";
import {
  buildStreakWeek,
  shouldShowStreakPopup,
  streakDaySummary,
  weekdayInitial,
} from "../../../../src/shared/lib/streak-popup.js";
import { computeStreak } from "../../../../src/shared/lib/streak.js";

describe("shouldShowStreakPopup", () => {
  const today = "2026-11-03";

  it("hides after dismiss on the same local day", () => {
    expect(
      shouldShowStreakPopup({ seenOn: today, today, streakCount: 4, todayActive: true })
    ).toBe(false);
  });

  it("shows again on a new local day", () => {
    expect(
      shouldShowStreakPopup({ seenOn: "2026-11-02", today, streakCount: 4, todayActive: false })
    ).toBe(true);
  });

  it("shows when the learner has a streak even if today is still open", () => {
    expect(
      shouldShowStreakPopup({ seenOn: null, today, streakCount: 2, todayActive: false })
    ).toBe(true);
  });

  it("shows for a first activity day with no prior streak", () => {
    expect(
      shouldShowStreakPopup({ seenOn: null, today, streakCount: 0, todayActive: true })
    ).toBe(true);
  });

  it("hides for a brand-new learner with no streak and no activity", () => {
    expect(
      shouldShowStreakPopup({ seenOn: null, today, streakCount: 0, todayActive: false })
    ).toBe(false);
  });
});

describe("buildStreakWeek", () => {
  const today = "2026-11-03"; // Monday

  it("returns seven days ending today with weekday initials", () => {
    const week = buildStreakWeek({
      today,
      activeDays: ["2026-11-01", "2026-11-02", "2026-11-03"],
      secondsByDay: { "2026-11-01": 600, "2026-11-02": 120, "2026-11-03": 45 },
    });
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.day)).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(week.map((d) => d.weekday)).toEqual(["W", "T", "F", "S", "S", "M", "T"]);
    expect(week.map((d) => d.status)).toEqual([
      "missed",
      "missed",
      "missed",
      "missed",
      "completed",
      "completed",
      "today",
    ]);
    expect(week.at(-1)?.seconds).toBe(45);
  });

  it("marks today as today even without activity", () => {
    const week = buildStreakWeek({ today, activeDays: ["2026-11-02"] });
    expect(week.at(-1)).toMatchObject({ day: today, status: "today", seconds: 0 });
    expect(week[5]).toMatchObject({ day: "2026-11-02", status: "completed" });
  });
});

describe("weekdayInitial", () => {
  it("uses the UTC weekday of the day key", () => {
    expect(weekdayInitial("2026-11-03")).toBe("T"); // Tuesday
    expect(weekdayInitial("2026-11-01")).toBe("S"); // Sunday
  });
});

describe("streakDaySummary", () => {
  it("describes today and past days", () => {
    expect(
      streakDaySummary(
        { day: "2026-11-03", weekday: "T", status: "today", seconds: 120 },
        "2026-11-03"
      )
    ).toContain("Today");
    expect(
      streakDaySummary(
        { day: "2026-11-02", weekday: "M", status: "completed", seconds: 600 },
        "2026-11-03"
      )
    ).toContain("10 minutes");
    expect(
      streakDaySummary(
        { day: "2026-11-01", weekday: "S", status: "missed", seconds: 0 },
        "2026-11-03"
      )
    ).toContain("no study logged");
  });
});

describe("streak calculation for the popup week", () => {
  it("counts consecutive active days the same way as habit streaks", () => {
    const today = "2026-11-03";
    const active = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    expect(computeStreak(active, today).count).toBe(4);
    expect(shouldShowStreakPopup({ seenOn: null, today, streakCount: 4, todayActive: true })).toBe(true);
  });
});
