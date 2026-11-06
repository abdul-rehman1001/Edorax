import type { PageArea } from '../shared/engagement/mascots';

// Where the learner is, read from a web-style path. An app with no URLs of its own (desktop, mobile)
// reports the path of the matching web page, so these and the attention clock work the same there.

/** Chapter reader pages, where only reactions to the learner's own actions may appear. */
export function isReadingPath(pathname: string): boolean {
  return /^\/courses\/[^/]+\/(?!checkout(?:\/|$))[^/]+\/?$/.test(pathname);
}

/** Top-level learn routes, by their first path segment. */
const AREA_BY_SEGMENT = new Map<string, PageArea>([
  ['catalog', 'catalog'],
  ['dashboard', 'dashboard'],
  ['leaderboard', 'dashboard'],
  ['my-courses', 'my-courses'],
  ['my-questions', 'my-questions'],
  ['progress', 'progress'],
  ['settings', 'settings'],
]);

/** The part of the app a path belongs to, for MASCOT_AREA_MAP; null outside the learn pages. */
export function pageAreaFor(pathname: string): PageArea | null {
  const [first, courseSlug, page, ...rest] = pathname.split('/').filter(Boolean);
  if (first !== 'courses') return AREA_BY_SEGMENT.get(first ?? '') ?? null;
  if (!courseSlug || rest.length > 0) return null;
  if (!page || page === 'variant') return 'course';
  return page === 'checkout' ? 'checkout' : 'chapter';
}
