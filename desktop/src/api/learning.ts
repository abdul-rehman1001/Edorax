import type {
  CourseOverview,
  UpdateCourseTrackResult,
} from '../../../server/src/shared/api/catalog';
import type { Result } from '../domain/catalog';
import type { Lesson, BlockState, AnswerResult } from '../domain/learning';
import type { AiInterviewSessionResult } from '../../../server/src/shared/api/ai';
import type {
  TrackEventRequest,
  TrackEventResult,
} from '../../../server/src/shared/api/engagement';
import { parseLesson } from '../learning/parse-lesson';
import { isRecord } from './validation';
type Request = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<Result<unknown>>;
const segment = (value: string) => encodeURIComponent(value);
function valid(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}
const invalid = {
  ok: false as const,
  code: 'INVALID_INPUT',
  message: 'Invalid lesson request.',
};
export function createLearningClient(request: Request) {
  return {
    async lesson(course: string, chapter: string): Promise<Result<Lesson>> {
      if (!valid(course) || !valid(chapter)) return invalid;
      const result = await request(
        '/api/v1/courses/' + segment(course) + '/chapters/' + segment(chapter),
      );
      if (!result.ok) return result;
      const data = result.data;
      if (
        !isRecord(data) ||
        !isRecord(data.chapter) ||
        !Array.isArray(data.modules) ||
        (data.content !== null &&
          (!isRecord(data.content) || typeof data.content.source !== 'string'))
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'The lesson could not be read.',
        };
      try {
        const document = parseLesson(
          isRecord(data.content) ? String(data.content.source) : '',
        );
        return { ok: true, data: { ...data, document } as Lesson };
      } catch {
        return {
          ok: false,
          code: 'INVALID_CONTENT',
          message:
            'This lesson has invalid content. Please contact your instructor.',
        };
      }
    },
    async overview(course: string): Promise<Result<CourseOverview>> {
      if (!valid(course)) return invalid;
      const result = await request(
        '/api/v1/courses/' + segment(course) + '/overview',
      );
      if (!result.ok) return result;
      if (
        !isRecord(result.data) ||
        !isRecord(result.data.course) ||
        !['active', 'none', 'payment_required'].includes(
          String(result.data.access),
        ) ||
        (result.data.access === 'active' &&
          (!isRecord(result.data.enrollment) ||
            !isRecord(result.data.syllabus) ||
            !Array.isArray(result.data.syllabus.modules)))
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not read the course overview.',
        };
      return { ok: true, data: result.data as CourseOverview };
    },
    async updateTrack(
      course: string,
      kind: 'variant' | 'specialisation',
      slug: string,
    ): Promise<Result<UpdateCourseTrackResult>> {
      if (
        !valid(course) ||
        !valid(slug) ||
        !['variant', 'specialisation'].includes(kind)
      )
        return invalid;
      const result = await request(
        '/api/v1/courses/' + segment(course) + '/track/' + kind,
        'PUT',
        { [kind + 'Slug']: slug },
      );
      if (!result.ok) return result;
      if (
        !isRecord(result.data) ||
        typeof result.data.courseSlug !== 'string' ||
        !isRecord(result.data.track)
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not confirm your course choice.',
        };
      return { ok: true, data: result.data as UpdateCourseTrackResult };
    },
    async block(id: string): Promise<Result<BlockState>> {
      if (!valid(id)) return invalid;
      const result = await request('/api/v1/blocks/' + segment(id) + '/state');
      if (!result.ok) return result;
      if (
        !isRecord(result.data) ||
        typeof result.data.type !== 'string' ||
        !isRecord(result.data.config)
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not load this exercise.',
        };
      return { ok: true, data: result.data as BlockState };
    },
    async aiInterview(
      id: string,
      action: 'start' | 'answer' | 'finish' | 'abandon',
      payload: unknown,
    ): Promise<Result<AiInterviewSessionResult>> {
      if (
        !valid(id) ||
        !['start', 'answer', 'finish', 'abandon'].includes(action) ||
        !isRecord(payload)
      )
        return invalid;
      const result = await request(
        `/api/v1/blocks/${segment(id)}/ai-interview/${action}`,
        'POST',
        payload,
      );
      if (!result.ok) return result;
      if (!isRecord(result.data) || !isRecord(result.data.session))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not load the interview response.',
        };
      return { ok: true, data: result.data as AiInterviewSessionResult };
    },
    async answer(
      id: string,
      payload: Record<string, unknown>,
    ): Promise<Result<AnswerResult>> {
      if (!valid(id) || !isRecord(payload)) return invalid;
      const result = await request(
        '/api/v1/blocks/' + segment(id) + '/respond',
        'POST',
        payload,
      );
      if (!result.ok) return result;
      if (!isRecord(result.data))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not confirm your answer.',
        };
      return { ok: true, data: result.data as AnswerResult };
    },
    async quiz(id: string) {
      if (!valid(id)) return invalid;
      return request('/api/v1/chapters/' + segment(id) + '/quiz');
    },
    async submitQuiz(
      id: string,
      answers: Array<{ blockId: string; selected: string[] }>,
    ) {
      if (!valid(id) || !Array.isArray(answers)) return invalid;
      return request(
        '/api/v1/chapters/' + segment(id) + '/quiz/submit',
        'POST',
        { answers },
      );
    },
    async complete(id: string) {
      if (!valid(id)) return invalid;
      return request('/api/v1/chapters/' + segment(id) + '/complete', 'POST');
    },
    async saveLog(id: string, answers: Record<string, string>) {
      if (!valid(id) || !isRecord(answers)) return invalid;
      return request(
        '/api/v1/chapters/' + segment(id) + '/learning-log',
        'PUT',
        { answers },
      );
    },
    /** Reports a learning moment; only the fields below ever reach the API. */
    async track(event: TrackEventRequest): Promise<Result<TrackEventResult>> {
      if (
        !isRecord(event) ||
        !valid(event.type) ||
        (event.courseId !== undefined && !valid(event.courseId)) ||
        (event.chapterId !== undefined && !valid(event.chapterId)) ||
        (event.area !== undefined && !valid(event.area))
      )
        return invalid;
      const { type, courseId, chapterId, area } = event;
      const result = await request('/api/v1/events', 'POST', {
        type,
        courseId,
        chapterId,
        area,
        reading: event.reading === true,
        platform: 'desktop',
      });
      if (!result.ok) return result;
      if (!isRecord(result.data) || !Array.isArray(result.data.events))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not read the mascot response.',
        };
      return { ok: true, data: result.data as TrackEventResult };
    },
    async checklist(id: string, item: string, checked: boolean) {
      if (!valid(id) || !valid(item) || typeof checked !== 'boolean')
        return invalid;
      return request(
        '/api/v1/chapters/' + segment(id) + '/checklist/' + segment(item),
        'PUT',
        { checked },
      );
    },
  };
}
