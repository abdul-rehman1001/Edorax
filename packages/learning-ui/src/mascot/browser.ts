import type { EngagementStore } from '../shared/engagement/engine';
import { startAttentionClock, watchEngagedTime } from './attention';
import type { MascotAdapter } from './runtime';

// The parts of a MascotAdapter any browser engine shares, web and Electron alike.

const SESSION_KEY = 'buildment:engagement:session';

const browserStore: EngagementStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or a full quota: the cooldown just lasts for this page instead.
    }
  },
};

/** Once per browser tab. */
function claimSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return false;
    window.sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    // Storage blocked: skip the session event rather than sending one per page.
    return false;
  }
}

export function browserMascotParts(path: () => string): Pick<MascotAdapter, 'path' | 'storage' | 'claimSession' | 'attention'> {
  return {
    path,
    storage: browserStore,
    claimSession,
    attention: {
      startClock: (onLongSession) => startAttentionClock(onLongSession, path),
      watch: watchEngagedTime,
    },
  };
}
