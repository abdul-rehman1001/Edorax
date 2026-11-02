import { createLearningClient } from './learning';
import { backendBase, isCourse } from './catalog';
import { isRecord as record, isCourseDetail as isDetail } from './validation';
import type {
  CatalogResult,
  CourseDetail,
  EnrollmentResult,
  Result,
} from '../domain/catalog';
import type { LearnerProfile } from '../../../server/src/shared/api/learner';

// This module runs only in Electron's main process. Tokens never cross IPC.
export function createPreviewClient(
  base: string,
  request: typeof fetch = fetch,
) {
  let token: string | null = null;
  let authVersion = 0;
  let userId: string | null = null;
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    session = token,
  ): Promise<Result<unknown>> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (session) headers.Authorization = 'Bearer ' + session;
      const snapshot = body instanceof Uint8Array;
      if (body !== undefined)
        headers['Content-Type'] = snapshot ? 'image/jpeg' : 'application/json';

      const options: RequestInit = {
        method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      };
      if (snapshot) options.body = new Uint8Array(body).buffer;
      else if (body !== undefined) options.body = JSON.stringify(body);

      const response = await request(backendBase(base) + path, options);
      if (response.status === 401 && session && session === token) token = null;
      if (response.status === 204) return { ok: true, data: null };
      const payload: unknown = await response.json();
      if (!response.ok || !record(payload) || payload.success !== true) {
        let code = 'REQUEST_FAILED';
        let message = 'The request could not be completed. Please try again.';
        if (record(payload)) {
          if (typeof payload.code === 'string') code = payload.code;
          if (typeof payload.message === 'string')
            message = payload.message.slice(0, 500);
        }
        if (response.status === 401) code = 'AUTH_REQUIRED';
        return { ok: false, code, message };
      }
      return { ok: true, data: payload.data };
    } catch {
      return {
        ok: false,
        code: 'CONNECTION_ERROR',
        message:
          'Could not reach the course service. Check your connection and try again.',
      };
    }
  }
  return {
    async integrityRequest(
      path: string,
      method: string,
      body?: unknown,
    ): Promise<Result<unknown>> {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to continue.',
        };
      // Only the integrity endpoints are available through this bridge.
      const opening =
        /^\/api\/v1\/chapters\/[a-zA-Z0-9_-]+\/integrity$/.test(path) &&
        method === 'POST';
      const events =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/events$/.test(path) &&
        method === 'POST';
      const camera =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/camera$/.test(path) &&
        method === 'PUT';
      const snapshot =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/snapshots$/.test(
          path,
        ) && method === 'POST';
      if (!opening && !events && !camera && !snapshot)
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid integrity request.',
        };
      if (
        snapshot &&
        (!(body instanceof Uint8Array) || body.byteLength > 48 * 1024)
      )
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid quiz snapshot.',
        };
      return call(path, method, body);
    },
    learning: createLearningClient(async (path, method, body) => {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to study this course.',
        };
      return call(path, method, body);
    }),
    async listCourses(): Promise<CatalogResult> {
      let result = await call('/api/v1/catalog');
      if (!result.ok && result.code === 'AUTH_REQUIRED')
        result = await call('/api/v1/catalog');
      if (!result.ok) return { ok: false, message: result.message };
      if (
        !record(result.data) ||
        !Array.isArray(result.data.courses) ||
        !result.data.courses.every(isCourse)
      )
        return {
          ok: false,
          message: 'The backend returned an unexpected course response.',
        };
      return { ok: true, courses: result.data.courses };
    },
    async courseDetail(slug: string): Promise<Result<CourseDetail>> {
      if (typeof slug !== 'string' || !slug || slug.length > 200)
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      const result = await call(`/api/v1/catalog/${encodeURIComponent(slug)}`);
      if (!result.ok) return result;
      if (!isDetail(result.data))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'The course service returned an unexpected curriculum. Please try again.',
        };
      return { ok: true, data: result.data };
    },
    async learnerProfile(): Promise<Result<LearnerProfile>> {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to view your profile.',
        };
      const result = await call('/api/v1/learner/profile');
      if (!result.ok) return result;
      if (!record(result.data) || typeof result.data.email !== 'string')
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not read your profile.',
        };
      return { ok: true, data: result.data as LearnerProfile };
    },
    async enroll(courseId: string): Promise<Result<EnrollmentResult>> {
      if (typeof courseId !== 'string' || !courseId || courseId.length > 200)
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to enroll in this course.',
        };
      const result = await call('/api/v1/enrollments', 'POST', { courseId });
      if (!result.ok) return result;
      if (
        !record(result.data) ||
        (result.data.lifecycle !== 'ACTIVE' &&
          result.data.lifecycle !== 'PAYMENT_REQUIRED')
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'Could not confirm enrollment. Refresh the course before trying again.',
        };
      return { ok: true, data: { lifecycle: result.data.lifecycle } };
    },
    // Ask the server which lesson this enrollment can open next.
    async nextLesson(slug: string): Promise<Result<{ href: string | null }>> {
      if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(slug))
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to start learning.',
        };
      const result = await call(
        '/api/v1/courses/' + encodeURIComponent(slug) + '/continue',
      );
      if (!result.ok) return result;
      if (!record(result.data))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not find the next lesson.',
        };
      const href = result.data.href;
      if (href === null) return { ok: true, data: { href: null } };
      // Only accept lesson paths belonging to this course.
      const prefix = '/courses/' + encodeURIComponent(slug) + '/';
      if (
        typeof href !== 'string' ||
        !href.startsWith(prefix) ||
        !/^[a-zA-Z0-9_-]+$/.test(href.slice(prefix.length))
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'The service returned an invalid lesson address.',
        };
      return { ok: true, data: { href } };
    },
    cancelSignIn() {
      authVersion++;
    },
    async authStatus(): Promise<Result<{ signedIn: boolean }>> {
      if (!token) return { ok: true, data: { signedIn: false } };
      const result = await call('/api/v1/auth/me');
      if (result.ok && record(result.data) && record(result.data.user)) {
        if (typeof result.data.user.id === 'string')
          userId = result.data.user.id;
        return { ok: true, data: { signedIn: true } };
      }
      // `call` clears the token on 401; otherwise keep the optimistic state.
      return { ok: true, data: { signedIn: Boolean(token) } };
    },
    async resolveLocalLabUser(): Promise<string | null> {
      if (!token) return null;
      if (userId) return userId;
      const session = token;
      const result = await call('/api/v1/auth/me', 'GET', undefined, session);
      if (session !== token)
        throw new Error('Your session changed. Reopen the workspace.');
      if (!result.ok) throw new Error(result.message);
      if (
        !record(result.data) ||
        !record(result.data.user) ||
        typeof result.data.user.id !== 'string'
      )
        throw new Error(
          'Could not identify your account. Please sign in again.',
        );
      userId = result.data.user.id;
      return userId;
    },
    localLabUser() {
      return token ? userId : null;
    },
    async exchange(
      code: string,
      verifier: string,
    ): Promise<Result<{ signedIn: true }>> {
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(code) ||
        !/^[A-Za-z0-9_-]{43}$/.test(verifier)
      )
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid browser sign-in response.',
        };
      const version = ++authVersion;
      const result = await call(
        '/api/v1/auth/desktop/exchange',
        'POST',
        { code, verifier },
        null,
      );
      if (!result.ok) return result;
      if (
        !record(result.data) ||
        !record(result.data.session) ||
        typeof result.data.session.token !== 'string' ||
        !result.data.session.token
      ) {
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'The service did not return a valid session. Please try again.',
        };
      }
      if (version !== authVersion)
        return {
          ok: false,
          code: 'CANCELLED',
          message: 'Sign-in was cancelled. Please try again.',
        };
      token = result.data.session.token;
      userId =
        record(result.data.user) && typeof result.data.user.id === 'string'
          ? result.data.user.id
          : null;
      return { ok: true, data: { signedIn: true } };
    },
    async signOut(): Promise<Result<{ signedIn: false }>> {
      const previous = token;
      token = null;
      authVersion++;
      if (previous) {
        const result = await call(
          '/api/v1/auth/logout',
          'POST',
          undefined,
          previous,
        );
        if (!result.ok)
          return {
            ok: false,
            code: 'LOCAL_SIGN_OUT',
            message:
              'Signed out on this device. The service could not confirm session revocation.',
          };
      }
      return { ok: true, data: { signedIn: false } };
    },
  };
}
