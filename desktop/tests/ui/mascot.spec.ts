import { test, expect, type Page } from '@playwright/test';
import { courses, courseDetail } from '../fixtures';
import { parseLesson } from '../../src/learning/parse-lesson';

// The shared mascot player inside the desktop window, through a mocked bridge. What the reaction
// says is the API's job; these check that desktop reports moments and shows what comes back.

const lessonDocument = parseLesson('# Lesson\n\nOne paragraph.');
const quizDocument = parseLesson('# Quiz\n\n<Quiz id="question-one" />');

const reaction = {
  version: 1,
  ruleId: 'chapter-completed',
  mascotId: 'zip',
  mascotName: 'Zip',
  role: 'celebrator',
  state: 'celebrate',
  asset: { image: '/mascots/zip/celebrate.svg', alt: 'Zip' },
  message: 'Lesson done!',
  voice: 'https://edorax.com/brand/dot/voice/lesson-done.mp3',
  xp: 20,
};

type Options = {
  quiz?: boolean;
  trackResult?: unknown;
  trackThrows?: boolean;
};

async function openLesson(page: Page, options: Options = {}) {
  await page.addInitScript(
    ({
      courses,
      courseDetail,
      lessonDocument,
      quizDocument,
      reaction,
      options,
    }) => {
      const state = window as any;
      state.tracked = [];
      state.opened = [];
      state.played = [];
      state.Audio = class {
        constructor(public src: string) {}
        addEventListener() {}
        removeEventListener() {}
        pause() {}
        play() {
          state.played.push(this.src);
          return Promise.resolve();
        }
      };
      let complete = false;
      let passed = false;
      let push: (item: unknown) => void = () => undefined;
      state.pushNotification = (item: unknown) => push(item);
      let signedIn = false;
      const modules = [
        {
          id: 'module',
          order: 1,
          title: 'Basics',
          completedCount: 0,
          chapters: [
            {
              id: 'chapter',
              slug: 'lesson-one',
              title: 'First lesson',
              status: 'IN_PROGRESS',
              blockCount: 1,
            },
          ],
        },
      ];
      state.buildment = {
        webOrigin: async () => 'https://edorax.com',
        openWeb: async (path: string) => state.opened.push(path),
        onNotification: (listener: (item: unknown) => void) => {
          push = listener;
          return () => undefined;
        },
        listCourses: async () => ({ ok: true, courses }),
        courseDetail: async () => ({
          ok: true,
          data: { ...courseDetail, signedIn, access: 'active' },
        }),
        signIn: async () => {
          signedIn = true;
          return { ok: true, data: { signedIn: true } };
        },
        signOut: async () => ({ ok: true, data: { signedIn: false } }),
        cancelSignIn: async () => {},
        enroll: async () => ({ ok: true, data: { lifecycle: 'ACTIVE' } }),
        startLearning: async () => ({
          ok: true,
          data: { href: '/courses/systems/lesson-one' },
        }),
        integrityRequest: async (path: string) =>
          path.endsWith('/integrity')
            ? {
                ok: true,
                data: {
                  attemptId: 'attempt',
                  attempt: 1,
                  startedAt: new Date().toISOString(),
                  flagCount: 0,
                  camera: {
                    enabled: false,
                    status: 'NOT_REQUESTED',
                    intervalSeconds: 60,
                    width: 320,
                    height: 240,
                    retentionDays: 30,
                  },
                },
              }
            : { ok: true, data: null },
        learning: {
          lesson: async () => ({
            ok: true,
            data: {
              course: {
                id: courses[0].id,
                slug: courses[0].slug,
                title: courses[0].title,
                projectGoal: null,
              },
              chapter: {
                id: 'chapter',
                slug: 'lesson-one',
                title: 'First lesson',
                lessonLabel: '01.01',
                estimatedMinutes: 10,
                readerMode: options.quiz ? 'QUIZ' : 'DEFAULT',
                isMilestone: false,
                blockCount: 1,
              },
              prev: null,
              next: null,
              modules,
              track: null,
              locked: false,
              previous: null,
              content: {
                source: '',
                learningLogAnswers: {},
                checklistState: {},
                chapterComplete: complete,
                canMarkComplete: !complete && (!options.quiz || passed),
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
              document: options.quiz ? quizDocument : lessonDocument,
            },
          }),
          block: async () => ({
            ok: true,
            data: {
              type: 'QUIZ',
              config: {
                quizType: 'single',
                prompt: 'Pick one',
                options: [
                  { id: 'one', label: 'Right' },
                  { id: 'two', label: 'Wrong' },
                ],
                allowRetry: true,
              },
              initialState: null,
            },
          }),
          quiz: async () => ({
            ok: true,
            data: {
              steps: [],
              blockIds: ['question-one'],
              initialAnswers: {},
              initialBlockGrades: {},
              initialScoreSummary: null,
            },
          }),
          submitQuiz: async (_id: string, answers: any[]) => {
            passed = answers[0].selected.includes('one');
            return { ok: true, data: { score: passed ? 1 : 0, maxScore: 1 } };
          },
          complete: async () => {
            complete = true;
            return { ok: true, data: null };
          },
          overview: async () => ({
            ok: true,
            data: {
              course: { ...courses[0], status: 'PUBLISHED' },
              access: 'active',
              coupon: null,
              track: null,
              enrollment: {
                percentComplete: 0,
                chaptersCompleted: 0,
                pendingReviews: 0,
              },
              syllabus: {
                modules,
                chapterCount: 1,
                continueHref: '/courses/systems/lesson-one',
                defaultOpenModuleId: 'module',
              },
            },
          }),
          saveLog: async () => ({ ok: true, data: null }),
          checklist: async () => ({ ok: true, data: null }),
          track: async (event: { type: string }) => {
            state.tracked.push(event);
            if (options.trackThrows) throw new Error('bridge down');
            if (event.type === 'session_start')
              return { ok: true, data: { events: [], reaction: null } };
            return {
              ok: true,
              data: {
                events: [],
                reaction:
                  options.trackResult === undefined
                    ? reaction
                    : options.trackResult,
              },
            };
          },
        },
      };
    },
    { courses, courseDetail, lessonDocument, quizDocument, reaction, options },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByRole('button', { name: 'Preview ' + courses[0].title, exact: true })
    .click();
  await page.getByRole('link', { name: 'Start learning', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'First lesson', exact: true }),
  ).toBeVisible();
}

const markComplete = (page: Page) =>
  page.getByRole('button', { name: 'Mark lesson complete' }).click();

test('completing a lesson reports it and shows the reaction the API sent', async ({
  page,
}) => {
  await openLesson(page);
  await markComplete(page);

  await expect(page.getByText('Lesson done!').last()).toBeVisible();
  await expect(page.getByText('+20 XP')).toBeVisible();
  const tracked = await page.evaluate(() => (window as any).tracked);
  expect(tracked).toContainEqual(
    expect.objectContaining({
      type: 'chapter_completed',
      chapterId: 'chapter',
      platform: 'desktop',
      reading: true,
      area: 'chapter',
    }),
  );
  await page.screenshot({ path: 'test-results/desktop-mascot.png' });

  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByText('+20 XP')).toHaveCount(0);
});

test('reports the session once signed in, and only then', async ({ page }) => {
  await openLesson(page);
  const tracked = await page.evaluate(() => (window as any).tracked);
  expect(
    tracked.filter((event: { type: string }) => event.type === 'session_start'),
  ).toHaveLength(1);
});

test('Dot stays silent until the learner turns the voice on, then says the line', async ({
  page,
}) => {
  await openLesson(page);
  await markComplete(page);
  await expect(page.getByText('+20 XP')).toBeVisible();
  expect(await page.evaluate(() => (window as any).played)).toEqual([]);

  await page.getByRole('button', { name: "Turn on Dot's voice" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).played))
    .toEqual([reaction.voice]);
  await expect(
    page.getByRole('button', { name: "Turn off Dot's voice" }),
  ).toBeVisible();
});

test('a live notification shows the API words, and its link leaves for the web app', async ({
  page,
}) => {
  await openLesson(page);
  await page.evaluate(() =>
    (window as any).pushNotification({
      id: 'n1',
      type: 'help.reply',
      createdAt: new Date().toISOString(),
      url: '/my-questions/1',
      reaction: {
        version: 1,
        ruleId: 'message-reply',
        state: 'message',
        message: 'Your mentor replied!',
        action: { label: 'Open', href: '/my-questions/1' },
      },
    }),
  );
  await page.getByRole('link', { name: 'Open', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).opened))
    .toEqual(['/my-questions/1']);
  await expect(
    page.getByRole('link', { name: 'Open', exact: true }),
  ).toHaveCount(0);
});

test('a reaction this app cannot read shows nothing and breaks nothing', async ({
  page,
}) => {
  await openLesson(page, {
    trackResult: { version: 99, message: 'From the future' },
  });
  await markComplete(page);
  await expect(
    page.getByRole('button', { name: 'Lesson completed' }),
  ).toBeDisabled();
  await expect(page.getByText('From the future')).toHaveCount(0);
});

test('a failed report never gets in the way of the lesson', async ({
  page,
}) => {
  await openLesson(page, { trackThrows: true });
  await markComplete(page);
  await expect(
    page.getByRole('button', { name: 'Lesson completed' }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Dot stays out of an open quiz and speaks once it closes', async ({
  page,
}) => {
  await openLesson(page, { quiz: true });
  await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
  await page.getByRole('radio', { name: 'Wrong', exact: true }).click();
  await page.getByRole('button', { name: 'Submit quiz', exact: true }).click();
  await expect(page.getByText('Quiz score: 0 / 1')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).tracked.some(
          (event: { type: string }) => event.type === 'quiz_submitted',
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByText('+20 XP')).toHaveCount(0);

  await page.getByRole('radio', { name: 'Right', exact: true }).click();
  await page.getByRole('button', { name: 'Submit again', exact: true }).click();
  await expect(page.getByText('Quiz score: 1 / 1')).toBeVisible();
  await expect(page.getByText('+20 XP')).toBeVisible();
});
