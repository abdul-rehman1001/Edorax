import { describe, expect, it } from "vitest";
import {
  shouldAutoResumeStudyTimer,
  shouldListenForStudyActivity,
} from "@/lib/study-session-activity";

describe("shouldAutoResumeStudyTimer", () => {
  it("resumes after an idle pause", () => {
    expect(shouldAutoResumeStudyTimer("paused", "inactive")).toBe(true);
  });

  it("resumes after the tab was hidden", () => {
    expect(shouldAutoResumeStudyTimer("paused", "hidden")).toBe(true);
  });

  it("does not resume a manual pause", () => {
    expect(shouldAutoResumeStudyTimer("paused", "manual")).toBe(false);
  });

  it("does nothing while running or idle", () => {
    expect(shouldAutoResumeStudyTimer("running", null)).toBe(false);
    expect(shouldAutoResumeStudyTimer("idle", null)).toBe(false);
    expect(shouldAutoResumeStudyTimer("paused", null)).toBe(false);
  });
});

describe("shouldListenForStudyActivity", () => {
  it("listens while the clock is running so idle can pause it", () => {
    expect(shouldListenForStudyActivity("running", null)).toBe(true);
  });

  it("keeps listening after an auto-pause so activity can resume", () => {
    expect(shouldListenForStudyActivity("paused", "inactive")).toBe(true);
    expect(shouldListenForStudyActivity("paused", "hidden")).toBe(true);
  });

  it("stops listening after a manual pause", () => {
    expect(shouldListenForStudyActivity("paused", "manual")).toBe(false);
    expect(shouldListenForStudyActivity("idle", null)).toBe(false);
  });
});
