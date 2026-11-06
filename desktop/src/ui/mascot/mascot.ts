import { browserMascotParts } from '@buildment/learning-ui/mascot/browser';
import { createMascotHooks } from '@buildment/learning-ui/mascot/hooks';
import { createMascotRuntime } from '@buildment/learning-ui/mascot/runtime';
import type { TrackEventRequest } from '../../../../server/src/shared/api/engagement';
import { createLiveNotifications } from './live-notifications';

// Desktop's adapter for the shared mascot runtime (packages/learning-ui/src/mascot/runtime.ts).
// Requests and the live stream go through the main process, which alone holds the session token.
// The window has no URLs, so setMascotPath reports the path of the matching web page.

let currentPath = '/catalog';

export function setMascotPath(path: string) {
  currentPath = path;
}

async function send(request: TrackEventRequest) {
  const result = await window.buildment.learning.track(request);
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

const runtime = createMascotRuntime({
  platform: 'desktop',
  send,
  ...browserMascotParts(() => currentPath),
  onNotification: (listener) => {
    const live = createLiveNotifications(
      listener,
      () => document.visibilityState === 'visible',
    );
    const stop = window.buildment.onNotification(live.receive);
    document.addEventListener('visibilitychange', live.flush);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', live.flush);
    };
  },
  onError: (error) => {
    if (import.meta.env.DEV) console.debug('[mascot] not tracked', error);
  },
});

export const { useMascot, useMascotReactions } = createMascotHooks(runtime);
export const trackMoment = runtime.track;
