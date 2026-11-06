import { describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@/shared/api/notifications';
import { decideReaction } from '@/shared/engagement/reactions';
import { memoryStore } from '@/shared/engagement/engine';
import { createMascotRuntime, type MascotAdapter } from '@buildment/learning-ui/mascot/runtime';

const reaction = decideReaction([
  { id: 'e', type: 'chapter_completed', courseId: null, chapterId: 'c', isNew: true, createdAt: '', payload: {} },
])!.reaction;

const item: NotificationItem = {
  id: 'n1',
  type: 'help.reply',
  category: 'activity',
  title: 'A reply',
  body: '',
  url: '/my-questions/1',
  courseId: null,
  readAt: null,
  createdAt: '2026-10-31T00:00:00.000Z',
};

function setup(overrides: Partial<MascotAdapter> = {}) {
  const send = vi.fn<MascotAdapter['send']>(async () => ({ events: [], reaction }));
  const runtime = createMascotRuntime({
    platform: 'desktop',
    send,
    path: () => '/catalog',
    storage: memoryStore(),
    ...overrides,
  });
  const shown = vi.fn();
  runtime.subscribe(shown);
  return { runtime, send, shown };
}

describe('mascot runtime', () => {
  it('reports a moment with where the learner is and shows the API reaction', async () => {
    const { runtime, send, shown } = setup({ path: () => '/courses/nets/ch-1' });
    runtime.track({ type: 'chapter_completed', chapterId: 'c' });
    await vi.waitFor(() => expect(shown).toHaveBeenCalledWith(reaction));
    expect(send).toHaveBeenCalledWith({
      type: 'chapter_completed',
      chapterId: 'c',
      platform: 'desktop',
      reading: true,
      area: 'chapter',
    });
  });

  it('never throws when the report fails', async () => {
    const onError = vi.fn();
    const { runtime, shown } = setup({ send: async () => Promise.reject(new Error('offline')), onError });
    expect(() => runtime.track({ type: 'session_start' })).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(shown).not.toHaveBeenCalled();
  });

  it('reports one note a minute per chapter', () => {
    const { runtime, send } = setup();
    runtime.track({ type: 'notes_saved', chapterId: 'a' });
    runtime.track({ type: 'notes_saved', chapterId: 'a' });
    runtime.track({ type: 'notes_saved', chapterId: 'b' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('starts a session once, only when the adapter says it is the first', () => {
    const claims = [true, false];
    const { runtime, send } = setup({ claimSession: () => claims.shift() ?? false });
    runtime.startSession();
    runtime.startSession();
    expect(send).toHaveBeenCalledOnce();
  });

  it('shows the API words for a live notification, and uses the rules without them', () => {
    let push: (item: NotificationItem) => void = () => undefined;
    const stop = vi.fn();
    const { runtime, shown } = setup({
      onNotification: (listener) => {
        push = listener;
        return stop;
      },
    });
    const release = runtime.announceMessages();
    push({ ...item, reaction: { ...reaction, message: 'From the API' } });
    expect(shown).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'From the API' }));
    push(item);
    expect(shown).toHaveBeenLastCalledWith(expect.objectContaining({ ruleId: 'message-reply' }));
    release();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('lets a toast stand down only while a player announces', () => {
    const { runtime } = setup({ onNotification: () => () => undefined });
    expect(runtime.announces(item)).toBe(false);
    const release = runtime.announceMessages();
    expect(runtime.announces(item)).toBe(true);
    expect(runtime.announces({ ...item, type: 'study.reminder' })).toBe(false);
    release();
    expect(runtime.announces(item)).toBe(false);
  });

  it('keeps going when the live feed cannot start', () => {
    const onError = vi.fn();
    const { runtime } = setup({
      onError,
      onNotification: () => {
        throw new Error('no bridge');
      },
    });
    expect(() => runtime.announceMessages()()).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('fires the time-based moments through the adapter clock, and does nothing without one', () => {
    const { runtime, send } = setup({
      attention: {
        startClock: (onLongSession) => {
          onLongSession();
          return () => undefined;
        },
        watch: (_ms, fire) => {
          fire();
          return () => undefined;
        },
      },
    });
    runtime.startStudyClock();
    runtime.watchChapter('c', 10);
    expect(send.mock.calls.map(([request]) => request.type)).toEqual(['long_session', 'chapter_lingering']);

    const bare = setup();
    bare.runtime.startStudyClock()();
    bare.runtime.watchChapter('c', 10)();
    expect(bare.send).not.toHaveBeenCalled();
  });
});
