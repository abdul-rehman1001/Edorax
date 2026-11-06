import { isReadingPath } from './paths';

// Two mascot moments come from how long the learner has been engaged, not from an action:
//   - a long while on one unfinished chapter: the helper offers a mentor (watchChapter),
//   - a long stretch of study: the supporter suggests a short break (startAttentionClock).
// Time counts like the app activity clock (app-activity-tracker.ts): the tab is visible and the
// learner interacted in the last two minutes. Neither moment interrupts typing, and the break
// waits for a natural pause: a page that is not a chapter, or the move to the next chapter. The
// server checks both before anything is shown (services/engagement/events.ts). This clock needs a
// DOM; a native app plugs its own into the runtime (MascotAdapter.attention).

const TICK_MS = 5_000;
const IDLE_MS = 2 * 60_000;
/** Away this long and a study stretch starts over. */
const BREAK_RESET_MS = 10 * 60_000;
export const LONG_SESSION_MS = 50 * 60_000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart', 'input'] as const;

type Watcher = { elapsedMs: number; thresholdMs: number; fire: () => void };

const watchers = new Set<Watcher>();
let clock: { holders: number; stop: () => void } | null = null;

/** Focus is in a text field, so a bubble now would interrupt typing. */
function typing(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return active.isContentEditable || active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && (active as HTMLInputElement).type !== 'checkbox');
}

function start(onLongSession: () => void, currentPath: () => string): () => void {
  let lastTickAt = Date.now();
  let lastInteractionAt = Date.now();
  let lastEngagedAt = Date.now();
  let stretchMs = 0;
  let longSessionSent = false;
  let lastPath = currentPath();

  const onInteraction = () => {
    lastInteractionAt = Date.now();
  };
  const tick = () => {
    const now = Date.now();
    const gap = Math.min(Math.max(now - lastTickAt, 0), 2 * TICK_MS);
    lastTickAt = now;
    const path = currentPath();
    const moved = path !== lastPath;
    lastPath = path;

    if (document.visibilityState !== 'visible' || now - lastInteractionAt >= IDLE_MS) return;
    if (now - lastEngagedAt > BREAK_RESET_MS) {
      stretchMs = 0;
      longSessionSent = false;
    }
    lastEngagedAt = now;
    stretchMs += gap;

    for (const watcher of watchers) {
      watcher.elapsedMs += gap;
      if (watcher.elapsedMs >= watcher.thresholdMs && !typing()) {
        watchers.delete(watcher);
        watcher.fire();
      }
    }

    if (!longSessionSent && stretchMs >= LONG_SESSION_MS && !typing() && (moved || !isReadingPath(path))) {
      longSessionSent = true;
      onLongSession();
    }
  };

  for (const event of INTERACTION_EVENTS) document.addEventListener(event, onInteraction, { capture: true, passive: true });
  window.addEventListener('focus', onInteraction);
  const timer = window.setInterval(tick, TICK_MS);
  return () => {
    window.clearInterval(timer);
    for (const event of INTERACTION_EVENTS) document.removeEventListener(event, onInteraction, true);
    window.removeEventListener('focus', onInteraction);
  };
}

/** Starts the tab's attention clock (or joins it) and returns a release function. */
export function startAttentionClock(onLongSession: () => void, currentPath: () => string): () => void {
  if (typeof window === 'undefined') return () => undefined;
  clock ??= { holders: 0, stop: start(onLongSession, currentPath) };
  clock.holders += 1;
  let released = false;
  return () => {
    if (released || !clock) return;
    released = true;
    clock.holders -= 1;
    if (clock.holders > 0) return;
    clock.stop();
    clock = null;
  };
}

/**
 * How long counts as "a long while" on a chapter: twice its estimate, kept between 10 and 45
 * minutes, or 20 minutes when the chapter has no estimate. Relative to the chapter, so it fits
 * short and long chapters in any course.
 */
export function lingeringThresholdMs(estimatedMinutes: number | null | undefined): number {
  const minutes = estimatedMinutes && estimatedMinutes > 0 ? Math.min(45, Math.max(10, estimatedMinutes * 2)) : 20;
  return minutes * 60_000;
}

/** Calls `fire` once after the learner has been engaged on this page for `thresholdMs`. */
export function watchEngagedTime(thresholdMs: number, fire: () => void): () => void {
  const watcher: Watcher = { elapsedMs: 0, thresholdMs, fire };
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}
