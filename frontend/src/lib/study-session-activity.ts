/** Same events the chapter study clock treats as learner activity. */
export const STUDY_ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "input",
  "touchstart",
] as const;

/** Idle pause after this much quiet time while the clock is running. */
export const STUDY_INACTIVITY_MS = 2 * 60_000;

type ClockStatus = "idle" | "running" | "paused";
type PauseReason = "manual" | "inactive" | "hidden" | null;

/**
 * Auto-paused clocks should listen for activity and resume. A manual pause must stay paused
 * until the learner presses Play.
 */
export function shouldAutoResumeStudyTimer(status: ClockStatus, pauseReason: PauseReason): boolean {
  return status === "paused" && (pauseReason === "inactive" || pauseReason === "hidden");
}

/** Keep activity listeners while running (to detect idle) or while auto-paused (to resume). */
export function shouldListenForStudyActivity(status: ClockStatus, pauseReason: PauseReason): boolean {
  return status === "running" || shouldAutoResumeStudyTimer(status, pauseReason);
}
