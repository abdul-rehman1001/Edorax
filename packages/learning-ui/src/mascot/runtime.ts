import type { EngagementPlatform, TrackEventRequest, TrackEventResult } from '../shared/api/engagement';
import type { NotificationItem } from '../shared/api/notifications';
import {
  createEngagementEngine,
  type EngagementEngine,
  type EngagementStore,
  type EngagementTrackInput,
  type MascotReaction,
} from '../shared/engagement/engine';
import { messageEventFor, messageKindFor } from '../shared/engagement/messages';
import { lingeringThresholdMs } from './attention';
import { isReadingPath, pageAreaFor } from './paths';

// One mascot for every app. The rules live in shared/engagement and the API decides each reaction;
// this is what an app runs around them: reporting moments, passing reactions to the one player, and
// the session, message and study-time moments. An app supplies a MascotAdapter once (the web in
// frontend/src/lib/engagement/client.ts, desktop in desktop/src/ui/mascot) and its screens only ever
// call track(). No browser or React code here, so React Native can run it unchanged.

export type MascotAdapter = {
  platform: EngagementPlatform;
  /** Reports a moment to POST /api/v1/events. May throw: the engine treats that as "no reaction". */
  send: (request: TrackEventRequest) => Promise<TrackEventResult>;
  /** Where the learner is, as the path of the matching web page. */
  path: () => string;
  storage?: EngagementStore;
  /** Calls back for each live notification; returns an unsubscribe function. */
  onNotification?: (listener: (item: NotificationItem) => void) => () => void;
  /** True the first time it is called in a session (a browser tab, an app launch). */
  claimSession?: () => boolean;
  /** Engaged-time clock; without it the two time-based moments never fire. */
  attention?: {
    startClock: (onLongSession: () => void) => () => void;
    watch: (thresholdMs: number, fire: () => void) => () => void;
  };
  onError?: (error: unknown) => void;
};

type Listener = (reaction: MascotReaction) => void;

export type MascotRuntime = {
  /** Reports a learning moment. Fire-and-forget: it never throws and nothing should await it. */
  track: (input: EngagementTrackInput) => void;
  /** Delivers each reaction to the player. */
  subscribe: (listener: Listener) => () => void;
  /** Reports the session start, once per session. */
  startSession: () => void;
  /**
   * While a player is mounted, the messenger announces the live notifications it has words for (a
   * mentor's reply, review feedback, a resolved question) instead of a toast.
   */
  announceMessages: () => () => void;
  /** True when the messenger shows this notification, so a toast can stand down. */
  announces: (item: NotificationItem) => boolean;
  /** Counts engaged time for the break suggestion after a long study stretch. */
  startStudyClock: () => () => void;
  /** Offers a mentor after a long while on this unfinished chapter (see lingeringThresholdMs). */
  watchChapter: (chapterId: string, estimatedMinutes: number | null | undefined) => () => void;
};

const noop = () => undefined;
/** The learning log autosaves while the learner types; one note event a minute per chapter is plenty. */
const NOTES_THROTTLE_MS = 60_000;

export function createMascotRuntime(adapter: MascotAdapter): MascotRuntime {
  const listeners = new Set<Listener>();
  const lastNotesSent = new Map<string, number>();
  let engine: EngagementEngine | null = null;
  /** How many players are announcing live messages (a layout mounts one). */
  let messengers = 0;

  function getEngine(): EngagementEngine {
    engine ??= createEngagementEngine({
      platform: adapter.platform,
      transport: adapter.send,
      present: (reaction) => {
        for (const listener of listeners) listener(reaction);
      },
      storage: adapter.storage,
      isReading: () => isReadingPath(adapter.path()),
      area: () => pageAreaFor(adapter.path()),
      onError: adapter.onError,
    });
    return engine;
  }

  function track(input: EngagementTrackInput): void {
    try {
      if (input.type === 'notes_saved' && input.chapterId) {
        const now = Date.now();
        if (now - (lastNotesSent.get(input.chapterId) ?? 0) < NOTES_THROTTLE_MS) return;
        lastNotesSent.set(input.chapterId, now);
      }
      void getEngine().track(input);
    } catch {
      // The engine already swallows its own failures; this only guards its construction.
    }
  }

  return {
    track,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startSession() {
      if (adapter.claimSession?.()) track({ type: 'session_start' });
    },
    announceMessages() {
      messengers += 1;
      let stop: (() => void) | undefined;
      try {
        stop = adapter.onNotification?.((item) => {
          // A notification without the API's words (a feed refresh, an older API) goes through the rules.
          if (item.reaction && getEngine().show(item.reaction)) return;
          const event = messageEventFor(item);
          if (event) getEngine().react([event]);
        });
      } catch (error) {
        // No live feed only costs the announcements, never the page around the player.
        adapter.onError?.(error);
      }
      return () => {
        messengers -= 1;
        stop?.();
      };
    },
    announces: (item) => messengers > 0 && messageKindFor(item) !== null,
    startStudyClock: () => adapter.attention?.startClock(() => track({ type: 'long_session' })) ?? noop,
    watchChapter(chapterId, estimatedMinutes) {
      const thresholdMs = lingeringThresholdMs(estimatedMinutes);
      return adapter.attention?.watch(thresholdMs, () => track({ type: 'chapter_lingering', chapterId })) ?? noop;
    },
  };
}
