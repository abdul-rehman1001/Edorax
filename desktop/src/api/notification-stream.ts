import {
  REALTIME_EVENTS,
  type NotificationItem,
} from '@buildment/learning-ui/shared/api/notifications';
import { isRecord } from './validation';

// The signed-in user's live notifications, read here in the main process because the session token
// never crosses IPC. Reconnects with backoff, and stops for good on sign-out or a rejected session.

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

type Open = (signal: AbortSignal) => Promise<Response | null>;
type Wait = (ms: number, signal: AbortSignal) => Promise<void>;

/** Splits complete server-sent event frames off `buffer`; `rest` waits for the next chunk. */
export function parseSseFrames(buffer: string): {
  frames: Array<{ event: string; data: string }>;
  rest: string;
} {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const frames = parts.flatMap((part) => {
    let event = '';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    return event && data.length ? [{ event, data: data.join('\n') }] : [];
  });
  return { frames, rest };
}

/** The notification a stream frame carries, or null for any other frame. */
export function notificationFrom(frame: {
  event: string;
  data: string;
}): NotificationItem | null {
  if (frame.event !== REALTIME_EVENTS.notificationNew) return null;
  try {
    const payload: unknown = JSON.parse(frame.data);
    if (!isRecord(payload) || !isRecord(payload.notification)) return null;
    const { id, type } = payload.notification;
    return typeof id === 'string' && typeof type === 'string'
      ? (payload.notification as NotificationItem)
      : null;
  } catch {
    return null;
  }
}

const waitFor: Wait = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export function createNotificationStream(
  open: Open,
  onNotification: (item: NotificationItem) => void,
  wait: Wait = waitFor,
) {
  let running: AbortController | null = null;

  async function read(response: Response, signal: AbortSignal) {
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = '';
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      const { frames, rest } = parseSseFrames(buffer + value);
      buffer = rest;
      for (const frame of frames) {
        const item = notificationFrom(frame);
        if (item) onNotification(item);
      }
    }
  }

  async function run(signal: AbortSignal) {
    let retry = 0;
    while (!signal.aborted) {
      try {
        const response = await open(signal);
        if (!response || response.status === 401) return;
        if (response.ok && response.body) {
          retry = 0;
          await read(response, signal);
        }
      } catch {
        // A dropped connection is expected; the loop below reconnects.
      }
      if (signal.aborted) return;
      const delay =
        RETRY_DELAYS_MS[Math.min(retry, RETRY_DELAYS_MS.length - 1)]!;
      retry += 1;
      await wait(delay, signal);
    }
  }

  return {
    start() {
      running?.abort();
      running = new AbortController();
      void run(running.signal);
    },
    stop() {
      running?.abort();
      running = null;
    },
  };
}
