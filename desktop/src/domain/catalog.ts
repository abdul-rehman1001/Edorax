import type {
  CatalogCourseSummary,
  CatalogCourseDetail,
} from '../../../server/src/shared/api/catalog';
import type { NotificationItem } from '../../../server/src/shared/api/notifications';

export type Course = CatalogCourseSummary;
export type CourseDetail = CatalogCourseDetail & { signedIn: boolean };
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string };
export type CatalogResult =
  | { ok: true; courses: Course[] }
  | { ok: false; message: string };
export type EnrollmentResult = { lifecycle: 'ACTIVE' | 'PAYMENT_REQUIRED' };
export interface DesktopAPI {
  readonly platform?: string;
  webOrigin(): Promise<string>;
  /** Opens a page of the web app in the default browser. */
  openWeb(path: string): Promise<void>;
  /** Live notifications for the signed-in user; returns an unsubscribe function. */
  onNotification(listener: (item: NotificationItem) => void): () => void;
  integrityRequest(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Result<unknown>>;
  learning: ReturnType<typeof import('../api/learning').createLearningClient>;
  startLearning(slug: string): Promise<Result<{ href: string | null }>>;
  enroll(courseId: string): Promise<Result<EnrollmentResult>>;
  listCourses(): Promise<CatalogResult>;
  courseDetail(slug: string): Promise<Result<CourseDetail>>;
  signIn(): Promise<Result<{ signedIn: true }>>;
  cancelSignIn(): Promise<void>;
  signOut(): Promise<Result<{ signedIn: false }>>;
}
declare global {
  interface Window {
    buildment: DesktopAPI;
  }
}

export function filterCourses(
  courses: Course[],
  query: string,
  category: string,
): Course[] {
  const search = query.trim().toLowerCase();
  return courses.filter(
    (course) =>
      (category === 'all' || course.category === category) &&
      [course.title, course.description, course.instructorName].some((value) =>
        value?.toLowerCase().includes(search),
      ),
  );
}

export function coursePrice(course: Course): string {
  if (course.pricingType === 'FREE') return 'Free';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: course.currency,
      maximumFractionDigits: 2,
    }).format(course.priceCents / 100);
  } catch {
    return `${course.currency} ${(course.priceCents / 100).toFixed(2)}`;
  }
}
