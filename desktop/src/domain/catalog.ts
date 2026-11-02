import type { IDEAPI } from './ide';
import type {
  CatalogCourseSummary,
  CatalogCourseDetail,
} from '../../../server/src/shared/api/catalog';
import type { LearnerProfile } from '../../../server/src/shared/api/learner';

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
  ide?: IDEAPI;
  labs: import('./labs').LabsAPI;
  readonly platform?: string;
  webOrigin(): Promise<string>;
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
  learnerProfile(): Promise<Result<LearnerProfile>>;
  signIn(): Promise<Result<{ signedIn: true }>>;
  authStatus(): Promise<Result<{ signedIn: boolean }>>;
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

export function isMyCourse(course: Course): boolean {
  return (
    course.enrollmentLifecycle === 'PENDING_ACCOUNT' ||
    course.enrollmentLifecycle === 'PAYMENT_REQUIRED' ||
    course.enrollmentLifecycle === 'ACTIVE' ||
    course.enrollmentLifecycle === 'COMPLETED'
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
