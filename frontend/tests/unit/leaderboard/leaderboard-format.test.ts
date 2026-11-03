import { describe, expect, it } from "vitest";
import { formatScore, initials, resetLabel } from "@/components/learn/leaderboard/leaderboard-format";

describe("leaderboard formatting", () => {
  it("formats initials correctly", () => {
    expect(initials("Aqib N.")).toBe("AN");
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Single")).toBe("S");
    expect(initials("")).toBe("?");
  });

  it("formats score with metric label", () => {
    expect(formatScore(1250, "XP")).toBe("1,250 XP");
    expect(formatScore(7, "day streak")).toBe("7-day streak");
  });

  it("computes reset labels", () => {
    const future = new Date(Date.now() + 2 * 86_400_000 + 60_000).toISOString();
    expect(resetLabel(future)).toContain("2 days");
  });
});
