import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backendBase, fetchCatalog } from '../src/api';
import { filterCourses } from '../src/domain/catalog';
import { courses, courseDetail } from './fixtures';
import { createPreviewClient } from '../src/api';
import { createBrowserAuth } from '../src/auth/browser-auth';
import {
  createNotificationStream,
  notificationFrom,
  parseSseFrames,
} from '../src/api/notification-stream';
import { createLiveNotifications } from '../src/ui/mascot/live-notifications';
import type { NotificationItem } from '../../server/src/shared/api/notifications';
import { createHash } from 'node:crypto';

test('catalog uses the existing envelope and fixed endpoint', async () => {
  const result = await fetchCatalog(
    'http://localhost:4000',
    async (url, init) => {
      assert.equal(url, 'http://localhost:4000/api/v1/catalog');
      assert.equal(init?.redirect, 'error');
      return Response.json({ success: true, data: { courses } });
    },
  );
  assert.deepEqual(result, { ok: true, courses });
});

test('browser callback rejects wrong state and binds code exchange to the private verifier', async () => {
  let challenge = '';
  const auth = createBrowserAuth(
    'http://localhost:3000',
    async (code, verifier) => {
      assert.equal(code, 'c'.repeat(43));
      assert.equal(
        createHash('sha256').update(verifier).digest('base64url'),
        challenge,
      );
      return { ok: true, data: { signedIn: true } };
    },
    async (raw) => {
      const url = new URL(raw);
      challenge = url.searchParams.get('challenge')!;
      assert.equal(url.pathname, '/desktop/connect');
      assert.equal(url.searchParams.has('verifier'), false);
      const callback = new URL(
        `http://127.0.0.1:${url.searchParams.get('port')}/callback`,
      );
      callback.search = new URLSearchParams({
        code: 'c'.repeat(43),
        state: 'invalid',
      }).toString();
      assert.equal((await fetch(callback)).status, 400);
      callback.searchParams.set('state', url.searchParams.get('state')!);
      assert.equal((await fetch(callback)).status, 200);
    },
  );
  try {
    assert.deepEqual(await auth.start(), {
      ok: true,
      data: { signedIn: true },
    });
  } finally {
    auth.cancel();
  }
});

test('browser opening failure resolves with an actionable error', async () => {
  const auth = createBrowserAuth(
    'http://localhost:3000',
    async () => {
      throw new Error('Must not exchange');
    },
    async () => {
      throw new Error('No browser');
    },
  );
  const result = await auth.start();
  assert.equal(!result.ok && result.code, 'BROWSER_ERROR');
});

test('preview login keeps bearer token private and sign-out clears it', async () => {
  const calls: string[] = [];
  const client = createPreviewClient(
    'http://localhost:4000',
    async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith('/exchange')) {
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        assert.deepEqual(JSON.parse(String(init?.body)), {
          code: 'c'.repeat(43),
          verifier: 'v'.repeat(43),
        });
        return Response.json({
          success: true,
          data: { session: { token: 'private-session' } },
        });
      }
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        calls.length === 1 || calls.length === 5
          ? null
          : 'Bearer private-session',
      );
      return Response.json({
        success: true,
        data: String(url).endsWith('/logout')
          ? { loggedOut: true }
          : courseDetail,
      });
    },
  );
  assert.equal((await client.courseDetail('systems')).ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(await client.exchange('c'.repeat(43), 'v'.repeat(43)), {
    ok: true,
    data: { signedIn: true },
  });
  assert.deepEqual(await client.courseDetail('systems'), {
    ok: true,
    data: courseDetail,
  });
  assert.deepEqual(await client.signOut(), {
    ok: true,
    data: { signedIn: false },
  });
  assert.equal((await client.courseDetail('systems')).ok, true);
  assert.equal(calls.length, 5);
});

test('expired sessions and unverified accounts respect backend access rules', async () => {
  let status = 403;
  const client = createPreviewClient('http://localhost:4000', async (url) =>
    String(url).endsWith('/exchange')
      ? Response.json({ success: true, data: { session: { token: 'token' } } })
      : Response.json(
          {
            success: false,
            code: 'EMAIL_UNVERIFIED',
            message: 'Verify your email',
          },
          { status },
        ),
  );
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  assert.deepEqual(await client.courseDetail('systems'), {
    ok: false,
    code: 'EMAIL_UNVERIFIED',
    message: 'Verify your email',
  });
  status = 401;
  const expired = await client.courseDetail('systems');
  assert.equal(!expired.ok && expired.code, 'AUTH_REQUIRED');
  const next = await client.courseDetail('systems');
  assert.equal(!next.ok && next.code, 'AUTH_REQUIRED');
});

test('malformed curriculum fails safely and offline logout still clears local session', async () => {
  const client = createPreviewClient('http://localhost:4000', async (url) => {
    if (String(url).endsWith('/logout')) throw new Error('offline');
    return Response.json({
      success: true,
      data: String(url).endsWith('/exchange')
        ? { session: { token: 'token' } }
        : { ...courseDetail, modules: [{}] },
    });
  });
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  const detail = await client.courseDetail('systems');
  assert.equal(!detail.ok && detail.code, 'INVALID_RESPONSE');
  const logout = await client.signOut();
  assert.equal(!logout.ok && logout.code, 'LOCAL_SIGN_OUT');
  const next = await client.courseDetail('systems');
  assert.equal(!next.ok && next.code, 'INVALID_RESPONSE');
});
test('rejects malformed courses without rendering broken data', async () => {
  for (const body of [
    { success: true, data: { courses: [{}] } },
    { success: false },
    {},
  ]) {
    assert.equal(
      (
        await fetchCatalog('http://localhost:4000', async () =>
          Response.json(body),
        )
      ).ok,
      false,
    );
  }
});
test('distinguishes empty catalog from HTTP and network failures', async () => {
  assert.deepEqual(
    await fetchCatalog('http://localhost:4000', async () =>
      Response.json({ success: true, data: { courses: [] } }),
    ),
    { ok: true, courses: [] },
  );
  assert.equal(
    (
      await fetchCatalog(
        'http://localhost:4000',
        async () => new Response('', { status: 503 }),
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await fetchCatalog('http://localhost:4000', async () => {
        throw new Error('offline');
      })
    ).ok,
    false,
  );
});
test('only allows secure remote or loopback backend origins', () => {
  assert.equal(
    backendBase('https://api.example.com/'),
    'https://api.example.com',
  );
  for (const url of [
    'http://example.com',
    'https://user:secret@example.com',
    'file:///tmp',
    'https://example.com/api',
  ])
    assert.throws(() => backendBase(url));
});
test('search and category selection work together', () => {
  assert.equal(filterCourses(courses, '  LINUX ', 'TECH').length, 1);
  assert.equal(filterCourses(courses, 'Linux', 'SOFT_SKILLS').length, 0);
  assert.equal(filterCourses(courses, 'mentor', 'all')[0]?.id, 'two');
});

test('enrollment requires login and sends the course ID with the private session', async () => {
  let calls = 0;
  let lifecycle = 'ACTIVE';
  const client = createPreviewClient(
    'http://localhost:4000',
    async (url, init) => {
      calls++;
      if (String(url).endsWith('/exchange'))
        return Response.json({
          success: true,
          data: { session: { token: 'private' } },
        });
      assert.equal(String(url), 'http://localhost:4000/api/v1/enrollments');
      assert.equal(init?.method, 'POST');
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer private',
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        courseId: 'course-id',
      });
      return Response.json({ success: true, data: { lifecycle } });
    },
  );
  const anonymous = await client.enroll('course-id');
  assert.equal(!anonymous.ok && anonymous.code, 'AUTH_REQUIRED');
  assert.equal(calls, 0);
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  assert.deepEqual(await client.enroll('course-id'), {
    ok: true,
    data: { lifecycle: 'ACTIVE' },
  });
  lifecycle = 'PAYMENT_REQUIRED';
  assert.deepEqual(await client.enroll('course-id'), {
    ok: true,
    data: { lifecycle: 'PAYMENT_REQUIRED' },
  });
  lifecycle = 'invalid';
  const malformed = await client.enroll('course-id');
  assert.equal(!malformed.ok && malformed.code, 'INVALID_RESPONSE');
});

test('next lesson requires login and rejects unsafe lesson addresses', async () => {
  let href: string | null = '/courses/systems/first-lesson';
  const client = createPreviewClient('http://localhost:4000', async (url) => {
    if (String(url).endsWith('/exchange'))
      return Response.json({
        success: true,
        data: { session: { token: 'private' } },
      });
    assert.equal(
      String(url),
      'http://localhost:4000/api/v1/courses/systems/continue',
    );
    return Response.json({ success: true, data: { href } });
  });
  const anonymous = await client.nextLesson('systems');
  assert.equal(!anonymous.ok && anonymous.code, 'AUTH_REQUIRED');
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  assert.deepEqual(await client.nextLesson('systems'), {
    ok: true,
    data: { href },
  });
  for (const unsafe of [
    'https://example.com',
    '/courses/other/lesson',
    '/courses/systems/../admin',
  ]) {
    href = unsafe;
    const result = await client.nextLesson('systems');
    assert.equal(!result.ok && result.code, 'INVALID_RESPONSE');
  }
  href = null;
  assert.deepEqual(await client.nextLesson('systems'), {
    ok: true,
    data: { href: null },
  });
});

test('native lesson API requires auth, parses content and handles 204 completion', async () => {
  const requests: string[] = [];
  const client = createPreviewClient(
    'http://localhost:4000',
    async (url, init) => {
      const path = String(url);
      requests.push(path);
      if (path.endsWith('/exchange'))
        return Response.json({
          success: true,
          data: { session: { token: 'private' } },
        });
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer private',
      );
      if (path.endsWith('/complete'))
        return new Response(null, { status: 204 });
      return Response.json({
        success: true,
        data: {
          chapter: { id: 'chapter' },
          modules: [],
          content: { source: '# Lesson\n\n<Quiz id="q1" />' },
        },
      });
    },
  );
  const anonymous = await client.learning.lesson('systems', 'intro');
  assert.equal(!anonymous.ok && anonymous.code, 'AUTH_REQUIRED');
  assert.equal(requests.length, 0);
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  const lesson = await client.learning.lesson('systems', 'intro');
  assert.equal(lesson.ok && lesson.data.document.type, 'root');
  assert.deepEqual(await client.learning.complete('chapter'), {
    ok: true,
    data: null,
  });
});

test('integrity bridge limits routes and snapshot uploads', async () => {
  let uploads = 0;
  const client = createPreviewClient(
    'http://localhost:4000',
    async (url, init) => {
      if (String(url).endsWith('/exchange'))
        return Response.json({
          success: true,
          data: { session: { token: 'private' } },
        });
      uploads++;
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer private',
      );
      assert.equal(
        new Headers(init?.headers).get('Content-Type'),
        'image/jpeg',
      );
      return Response.json({ success: true, data: {} });
    },
  );
  const path = '/api/v1/integrity/attempts/attempt-1/snapshots';
  assert.equal((await client.integrityRequest(path, 'POST')).ok, false);
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  for (const [route, method, body] of [
    ['/api/v1/admin/users', 'POST', {}],
    [path, 'DELETE', {}],
    [path, 'POST', {}],
    [path, 'POST', new Uint8Array(48 * 1024 + 1)],
  ] as const) {
    const result = await client.integrityRequest(route, method, body);
    assert.equal(!result.ok && result.code, 'INVALID_INPUT');
  }
  assert.equal(uploads, 0);
  assert.equal(
    (await client.integrityRequest(path, 'POST', new Uint8Array([1, 2]))).ok,
    true,
  );
  assert.equal(uploads, 1);
});

test('native parser keeps JavaScript inert and uses consistent reflection IDs', async () => {
  const { parseLesson } = await import('../src/learning/parse-lesson');
  const tree = parseLesson(
    '# Lesson\n\n{globalThis.untrustedCode()}\n\n<Quiz id="q1" config={globalThis.untrustedCode()} />\n\n## Learning log\n\n1. What did you learn?\n',
  );
  const json = JSON.stringify(tree);
  assert.ok(json.includes('LearningLog'));
  assert.ok(json.includes('q1'));
  assert.equal(json.includes('"config"'), false);
});

test('native parser reads literal object props but never calls code', async () => {
  const { parseLesson } = await import('../src/learning/parse-lesson');
  const tree = parseLesson(
    "<Roadmap milestones={[{title: 'Build', order: -1}]} enabled /><Callout content={process.exit()} />",
  );
  assert.deepEqual(tree.children?.[0].attributes?.milestones, [
    { title: 'Build', order: -1 },
  ]);
  assert.equal(tree.children?.[0].attributes?.enabled, true);
  assert.equal(JSON.stringify(tree).includes('process.exit'), false);
});

test('native parser draws flow, sequence and convertible Mermaid fences with the shared Diagram', async () => {
  const { parseLesson } = await import('../src/learning/parse-lesson');
  const flow =
    '```flow\ntitle: Your request finds the server\nactor You\nend Server\nYou -> Server\n```';
  const mermaid =
    '## One computer, two numbers\n\n```mermaid\nflowchart LR\n  A["Phone"] --> B["Router"]\n```';
  const tree = parseLesson(`${flow}\n\n${mermaid}\n`);
  const diagrams = (tree.children || []).filter(
    (node) => node.name === 'Diagram',
  );
  assert.equal(diagrams.length, 2);
  assert.equal(diagrams[0].attributes?.kind, 'flow');
  assert.ok(String(diagrams[0].attributes?.spec).includes('You -> Server'));
  assert.ok(
    String(diagrams[1].attributes?.spec).includes(
      'title: One computer, two numbers',
    ),
  );
  assert.equal(JSON.stringify(tree).includes('"code"'), false);
});

test('native parser hands Mermaid it cannot convert to the shared MermaidDiagram', async () => {
  const { parseLesson } = await import('../src/learning/parse-lesson');
  const chart =
    'gantt\n  title Plan\n  section Build\n  Write :a1, 2026-01-01, 3d';
  const tree = parseLesson('```mermaid\n' + chart + '\n```\n');
  const node = tree.children?.[0];
  assert.equal(node?.type, 'mdxJsxFlowElement');
  assert.equal(node?.name, 'MermaidDiagram');
  assert.equal(node?.attributes?.chart, chart);
});

test('learner overview preserves progress and syllabus instead of catalog data', async () => {
  const { createLearningClient } = await import('../src/api/learning');
  const { courseOverview } = await import('./fixtures');
  const client = createLearningClient(async (path) => {
    assert.equal(path, '/api/v1/courses/systems/overview');
    return { ok: true, data: courseOverview };
  });
  assert.deepEqual(await client.overview('systems'), {
    ok: true,
    data: courseOverview,
  });
  const malformed = createLearningClient(async () => ({
    ok: true,
    data: { course: {}, access: 'active', syllabus: null },
  }));
  assert.equal((await malformed.overview('systems')).ok, false);
});

test('desktop track updates use fixed endpoints and reject invalid action kinds', async () => {
  const { createLearningClient } = await import('../src/api/learning');
  const calls: unknown[] = [];
  const client = createLearningClient(async (path, method, body) => {
    calls.push([path, method, body]);
    return { ok: true, data: { courseSlug: 'systems', track: {} } };
  });
  await client.updateTrack('systems', 'variant', 'books');
  await client.updateTrack('systems', 'specialisation', 'inventory-at-scale');
  const invalid = await client.updateTrack(
    'systems',
    '../admin' as 'variant',
    'books',
  );
  assert.equal(invalid.ok, false);
  assert.deepEqual(calls, [
    ['/api/v1/courses/systems/track/variant', 'PUT', { variantSlug: 'books' }],
    [
      '/api/v1/courses/systems/track/specialisation',
      'PUT',
      { specialisationSlug: 'inventory-at-scale' },
    ],
  ]);
});

test('home catalog includes the private session after login and removes it after logout', async () => {
  const seen: Array<string | null> = [];
  const client = createPreviewClient(
    'https://api.example.com',
    async (url, init) => {
      if (String(url).endsWith('/exchange'))
        return Response.json({
          success: true,
          data: { session: { token: 'private-session' } },
        });
      if (String(url).endsWith('/logout'))
        return Response.json({ success: true, data: {} });
      const auth = new Headers(init?.headers).get('Authorization');
      seen.push(auth);
      return Response.json({
        success: true,
        data: {
          courses: [
            { ...courses[0], enrollmentLifecycle: auth ? 'ACTIVE' : null },
          ],
        },
      });
    },
  );
  await client.listCourses();
  await client.exchange('c'.repeat(43), 'v'.repeat(43));
  const enrolled = await client.listCourses();
  assert.equal(
    enrolled.ok && enrolled.courses[0].enrollmentLifecycle,
    'ACTIVE',
  );
  await client.signOut();
  const signedOut = await client.listCourses();
  assert.equal(signedOut.ok && signedOut.courses[0].enrollmentLifecycle, null);
  assert.deepEqual(seen, [null, 'Bearer private-session', null]);
});

test('stream frames are split across chunks and only complete ones are read', () => {
  const first = parseSseFrames(
    'retry: 5000\n: connected\n\nevent: notification:new\ndata: {"a":',
  );
  assert.deepEqual(first.frames, []);
  const second = parseSseFrames(first.rest + '1}\n\n: heartbeat\n\n');
  assert.deepEqual(second.frames, [
    { event: 'notification:new', data: '{"a":1}' },
  ]);
  assert.equal(second.rest, '');
});

test('only well-formed new notifications leave the stream', () => {
  const data = JSON.stringify({
    notification: { id: 'n1', type: 'help.reply' },
    unreadCount: 1,
  });
  assert.equal(notificationFrom({ event: 'notification:new', data })?.id, 'n1');
  assert.equal(notificationFrom({ event: 'notification:read', data }), null);
  assert.equal(
    notificationFrom({ event: 'notification:new', data: '{' }),
    null,
  );
  assert.equal(
    notificationFrom({
      event: 'notification:new',
      data: '{"notification":{}}',
    }),
    null,
  );
});

const sseResponse = (text: string) =>
  new Response(new Blob([text]).stream(), { status: 200 });
const pushed = (id: string) =>
  `event: notification:new\ndata: ${JSON.stringify({ notification: { id, type: 'help.reply' } })}\n\n`;

test('notification stream reconnects after a drop and stops on a rejected session', async () => {
  const responses = [
    sseResponse(pushed('n1')),
    new Response(null, { status: 500 }),
    sseResponse(pushed('n2')),
    new Response(null, { status: 401 }),
  ];
  const received: string[] = [];
  const waits: number[] = [];
  const opened: boolean[] = [];
  let finished = () => undefined as void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const stream = createNotificationStream(
    async () => {
      opened.push(true);
      const next = responses.shift()!;
      if (!responses.length) setTimeout(finished, 10);
      return next;
    },
    (item) => received.push(item.id),
    async (ms) => {
      waits.push(ms);
    },
  );
  stream.start();
  await done;
  assert.deepEqual(received, ['n1', 'n2']);
  assert.equal(opened.length, 4);
  assert.deepEqual(waits, [2_000, 5_000, 2_000]);
});

test('notification stream never opens signed out, and stop ends a running loop', async () => {
  let opens = 0;
  const signedOut = createNotificationStream(
    async () => {
      opens += 1;
      return null;
    },
    () => undefined,
  );
  signedOut.start();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(opens, 1);

  let aborted = false;
  const running = createNotificationStream(
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }),
    () => undefined,
  );
  running.start();
  running.stop();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(aborted, true);
});

test('the stream carries the session token and sign-out removes it', async () => {
  const headers: Array<string | null> = [];
  const client = createPreviewClient('http://localhost:4000', (async (
    url: string,
    init: RequestInit,
  ) => {
    if (String(url).endsWith('/stream')) {
      headers.push(new Headers(init.headers).get('authorization'));
      return new Response('');
    }
    return Response.json({
      success: true,
      data: { session: { token: 'private-session' } },
    });
  }) as typeof fetch);
  const signal = new AbortController().signal;
  assert.equal(await client.openNotificationStream(signal), null);
  await client.exchange('a'.repeat(43), 'b'.repeat(43));
  await client.openNotificationStream(signal);
  assert.deepEqual(headers, ['Bearer private-session']);
  await client.signOut();
  assert.equal(await client.openNotificationStream(signal), null);
});

test('mascot events go out as desktop, with only the known fields', async () => {
  const bodies: unknown[] = [];
  const client = createPreviewClient('http://localhost:4000', (async (
    url: string,
    init: RequestInit,
  ) => {
    if (String(url).endsWith('/exchange'))
      return Response.json({
        success: true,
        data: { session: { token: 'private-session' } },
      });
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({
      success: true,
      data: { events: [], reaction: null },
    });
  }) as typeof fetch);
  const moment = { type: 'chapter_completed', chapterId: 'c1' } as const;
  assert.equal((await client.learning.track(moment)).ok, false);
  await client.exchange('a'.repeat(43), 'b'.repeat(43));
  const result = await client.learning.track({
    ...moment,
    reading: true,
    area: 'chapter',
    platform: 'web',
    userId: 'someone-else',
  } as never);
  assert.equal(result.ok, true);
  assert.deepEqual(bodies, [
    {
      type: 'chapter_completed',
      chapterId: 'c1',
      area: 'chapter',
      reading: true,
      platform: 'desktop',
    },
  ]);
  const bad = await client.learning.track({ type: '' } as never);
  assert.equal(!bad.ok && bad.code, 'INVALID_INPUT');
});

test('live notifications arrive once, fresh, and wait for a hidden window', () => {
  const start = Date.parse('2026-10-31T12:00:00.000Z');
  let clock = start;
  let visible = true;
  const shown: string[] = [];
  const live = createLiveNotifications(
    (item) => shown.push(item.id),
    () => visible,
    () => clock,
  );
  const at = (id: string, createdAt: number) =>
    ({ id, createdAt: new Date(createdAt).toISOString() }) as NotificationItem;

  live.receive(at('fresh', start));
  live.receive(at('fresh', start));
  live.receive(at('stale', start - 61_000));
  assert.deepEqual(shown, ['fresh']);

  visible = false;
  live.receive(at('held', start));
  live.receive(at('too-long', start));
  live.flush();
  assert.deepEqual(shown, ['fresh']);

  visible = true;
  clock = start + 4 * 60_000;
  live.flush();
  assert.deepEqual(shown, ['fresh', 'held', 'too-long']);

  visible = false;
  live.receive(at('expired', clock));
  visible = true;
  clock += 6 * 60_000;
  live.flush();
  assert.equal(shown.includes('expired'), false);
});
