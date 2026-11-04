import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backendBase, fetchCatalog } from '../src/api';
import { filterCourses } from '../src/domain/catalog';
import { courses, courseDetail } from './fixtures';
import { createPreviewClient } from '../src/api';
import { createBrowserAuth } from '../src/auth/browser-auth';
import { createHash } from 'node:crypto';
import { createLearningClient } from '../src/api/learning';
import {
  OfflineStore,
  type OfflineStorageDriver,
  type DownloadedCourse,
} from '../src/offline/store';
import type { Lesson } from '../src/domain/learning';

test('offline download validates the chapter package and parses unlocked and locked lessons', async () => {
  const paths: string[] = [];
  const client = createLearningClient(async (path) => {
    paths.push(path);
    return {
      ok: true,
      data: {
        releaseId: 'release-2',
        lesson: {
          chapter: { id: 'chapter-1', slug: 'intro' },
          modules: [],
          content: paths.length === 1 ? { source: '# Hello' } : null,
          locked: paths.length !== 1,
        },
        blocks: {},
      },
    };
  });
  const unlocked = await client.downloadChapter('course', 'intro');
  assert.equal(unlocked.ok && unlocked.data.lesson.content?.source, '# Hello');
  assert.equal(unlocked.ok && unlocked.data.lesson.document.type, 'root');
  const locked = await client.downloadChapter('course', 'next');
  assert.equal(locked.ok && locked.data.lesson.locked, true);
  assert.deepEqual(paths, [
    '/api/v1/courses/course/chapters/intro/download',
    '/api/v1/courses/course/chapters/next/download',
  ]);
});

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

test('session restoration and snapshot preserves token and userId until expiration', async () => {
  const client = createPreviewClient('http://localhost:4000', async (url) => {
    if (String(url).endsWith('/auth/me')) {
      return Response.error();
    }
    return Response.json({ success: true, data: {} });
  });

  client.restoreSession({
    token: 'tok-1',
    userId: 'user-1',
    expiresAt: new Date(Date.now() - 10_000).toISOString(),
  });
  assert.equal(client.sessionSnapshot(), null);

  const future = new Date(Date.now() + 60_000).toISOString();
  client.restoreSession({
    token: 'tok-2',
    userId: 'user-2',
    expiresAt: future,
  });
  assert.deepEqual(client.sessionSnapshot(), {
    token: 'tok-2',
    userId: 'user-2',
    expiresAt: future,
  });

  const status = await client.authStatus();
  assert.equal(status.ok, true);
  assert.equal(status.data.signedIn, true);

  await client.signOut();
  assert.equal(client.sessionSnapshot(), null);
});

test('offline store encrypts session, isolates users, deduplicates notes/checklists, and manages downloads', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'edorax-store-test-'));
  try {
    const driver: OfflineStorageDriver = {
      available: () => true,
      dataPath: () => path.join(tempDir, 'learner-offline.dat'),
      encrypt: async (text: string) => Buffer.from(text, 'utf8'),
      decrypt: async (buf: Buffer) => ({
        result: buf.toString('utf8'),
        shouldReEncrypt: false,
      }),
    };

    const store = new OfflineStore(driver);
    await store.open();
    assert.equal(store.available(), true);
    assert.equal(store.session(), null);

    const future = new Date(Date.now() + 60_000).toISOString();
    await store.setSession({
      token: 'tok-a',
      userId: 'user-a',
      expiresAt: future,
    });
    assert.equal(store.session()?.userId, 'user-a');

    const mockLesson: Lesson = {
      chapter: {
        id: 'ch-1',
        slug: 'lesson-1',
        title: 'Lesson 1',
        lessonLabel: '01.01',
        estimatedMinutes: 10,
        readerMode: 'DEFAULT',
        isMilestone: false,
        blockCount: 1,
      },
      course: {
        id: 'c-1',
        slug: 'course-1',
        title: 'Course 1',
        projectGoal: null,
      },
      document: { type: 'root', children: [] },
      content: {
        source: '# Lesson 1',
        learningLogAnswers: {},
        checklistState: { 'item-1': false },
        chapterComplete: false,
        canMarkComplete: false,
        checkpointsCompleted: 0,
        checkpointsTotal: 1,
        nextLocked: false,
        reflectionPending: false,
        recap: { checks: '', open: '', next: '' },
        streakMilestone: null,
        headingNotes: {},
        predictGate: false,
        predictRevealed: true,
        helpThread: null,
      },
      locked: false,
      prev: null,
      previous: null,
      next: null,
      track: null,
      modules: [],
    };
    const mockCourse: DownloadedCourse = {
      releaseId: 'rel-1',
      downloadedAt: new Date().toISOString(),
      summary: courses[0]!,
      detail: { ...courseDetail, signedIn: true },
      overview: {
        access: 'active',
        enrollment: null,
        syllabus: null,
        course: null,
      } as any,
      lessons: { 'lesson-1': mockLesson },
      blocks: {},
    };
    await store.setCourse('course-1', mockCourse);
    assert.equal(store.course('course-1')?.releaseId, 'rel-1');
    assert.equal(store.hasChapter('ch-1'), true);

    await store.queue({
      kind: 'log',
      chapterId: 'ch-1',
      answers: { note1: 'first answer' },
    });
    assert.equal(
      store.course('course-1')?.lessons['lesson-1']?.content?.learningLogAnswers
        ?.note1,
      'first answer',
    );
    assert.equal(store.pending().length, 1);

    await store.queue({
      kind: 'log',
      chapterId: 'ch-1',
      answers: { note1: 'updated answer', note2: 'second answer' },
    });
    assert.equal(store.pending().length, 1);
    assert.equal(
      store.course('course-1')?.lessons['lesson-1']?.content?.learningLogAnswers
        ?.note1,
      'updated answer',
    );

    await store.queue({
      kind: 'checklist',
      chapterId: 'ch-1',
      item: 'item-1',
      checked: true,
    });
    assert.equal(
      store.course('course-1')?.lessons['lesson-1']?.content?.checklistState?.[
        'item-1'
      ],
      true,
    );
    assert.equal(store.pending().length, 2);

    await store.queue({
      kind: 'checklist',
      chapterId: 'ch-1',
      item: 'item-1',
      checked: false,
    });
    assert.equal(store.pending().length, 2);
    assert.equal(
      store.course('course-1')?.lessons['lesson-1']?.content?.checklistState?.[
        'item-1'
      ],
      false,
    );

    await assert.rejects(
      store.removeCourse('course-1'),
      /Sync your saved notes/,
    );

    await store.shiftPending();
    await store.shiftPending();
    assert.equal(store.pending().length, 0);

    await store.removeCourse('course-1');
    assert.equal(store.course('course-1'), undefined);

    await store.setCourse('course-1', mockCourse);
    await store.setSession({
      token: 'tok-b',
      userId: 'user-b',
      expiresAt: future,
    });
    assert.equal(store.course('course-1'), undefined);
    assert.equal(store.courses().length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
