import { test, expect } from '@playwright/test';
import { courses } from '../fixtures';

test('catalog search, categories, and sidebar work', async ({ page }) => {
  await page.addInitScript((data) => {
    window.buildment = {
      ...window.buildment,
      platform: 'darwin',
      listCourses: async () => ({ ok: true, courses: data }),
    };
  }, courses);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: courses[0].title }),
  ).toBeVisible();
  const toolbar = page.getByRole('banner', { name: 'Window toolbar' });
  await expect(toolbar).toHaveCSS('padding-left', '92px');
  await expect(toolbar).toHaveCSS('-webkit-app-region', 'drag');
  await expect(
    toolbar.getByRole('button', { name: 'Sign in', exact: true }),
  ).toHaveCSS('-webkit-app-region', 'no-drag');
  await expect(toolbar).not.toContainText('Workspace /');
  await expect(page.locator('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Soft Skills', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'All categories', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Search courses' })
    .fill('nothing matches');
  await expect(page.getByText('No matching courses')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Main navigation' }),
  ).toHaveCSS('width', '220px');
  await page.screenshot({
    path: 'test-results/catalog-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 760, height: 600 });
  await expect(
    page.getByRole('heading', { name: 'Explore courses' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('error retry resolves to an empty catalog', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    window.buildment = {
      ...window.buildment,
      listCourses: async () =>
        ++calls === 1
          ? { ok: false, message: 'Backend unavailable' }
          : { ok: true, courses: [] },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Backend unavailable');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('A new chapter is on its way')).toBeVisible();
});

test('loading state appears until the backend responds', async ({ page }) => {
  await page.addInitScript(() => {
    window.buildment = {
      ...window.buildment,
      listCourses: () => new Promise(() => {}),
    };
  });
  await page.goto('/');
  await expect(
    page.getByRole('status', { name: 'Loading courses' }),
  ).toBeVisible();
  await expect(page.locator('#startup-status')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Refresh courses' }),
  ).toBeDisabled();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`branded loader paints before JavaScript and styles load (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    // Hold the entry module so neither React nor the bundled stylesheet can run.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/src/startup.ts', async (route) => {
      await held;
      await route.continue();
    });
    await page.addInitScript((data) => {
      window.buildment = {
        ...window.buildment,
        listCourses: async () => ({ ok: true, courses: data }),
      };
    }, courses);
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await expect(
        page.getByRole('img', { name: 'Edorax logo' }),
      ).toBeVisible();
      await expect(
        page.getByText('Opening your learning workspace…'),
      ).toBeVisible();
      const background = await page
        .locator('#startup-status')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(background).toBe(
        scheme === 'dark' ? 'oklch(0.155 0.012 78)' : 'oklch(1 0 0)',
      );
      await page.screenshot({ path: `test-results/preloader-${scheme}.png` });
    } finally {
      release();
    }
    await expect(
      page.getByRole('heading', { name: 'Explore courses' }),
    ).toBeVisible();
    await expect(page.locator('#startup-status')).toBeHidden();
  });
}

test('module failure shows recovery instead of a blank window', async ({
  page,
}) => {
  await page.route('**/src/renderer.tsx', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText(/The workspace could not start/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reload workspace' }),
  ).toBeVisible();
});

test('Edorax dark palette renders and storage failures do not block startup', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript((data) => {
    window.buildment = {
      ...window.buildment,
      listCourses: async () => ({ ok: true, courses: data }),
    };
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  }, courses);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Explore courses' }),
  ).toBeVisible();
  await expect(page.locator('#startup-status')).toBeHidden();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background')
        .trim(),
    ),
  ).toBe('oklch(0.155 0.012 78)');
  await page.screenshot({ path: 'test-results/catalog-dark.png' });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
});

test('home enrollment badges and actions refresh on sign-in and sign-out', async ({
  page,
}) => {
  await page.addInitScript((courses) => {
    let signedIn = false;
    window.buildment = {
      ...window.buildment,
      listCourses: async () => ({
        ok: true,
        courses: courses.map((course, index) => ({
          ...course,
          enrollmentLifecycle: signedIn
            ? index === 0
              ? 'ACTIVE'
              : 'PAYMENT_REQUIRED'
            : null,
        })),
      }),
      signIn: async () => {
        signedIn = true;
        return { ok: true, data: { signedIn: true } };
      },
      signOut: async () => {
        signedIn = false;
        return { ok: true, data: { signedIn: false } };
      },
    };
  }, courses);
  await page.goto('/');
  await expect(page.getByText('Enrolled', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Enrolled', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment due', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open ' + courses[0].title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'View enrollment for ' + courses[1].title,
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/catalog-enrollment.png',
    fullPage: true,
  });
  await page.locator('summary').filter({ hasText: 'Profile' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Enrolled', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Payment due', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Preview ' + courses[0].title,
      exact: true,
    }),
  ).toBeVisible();
});
