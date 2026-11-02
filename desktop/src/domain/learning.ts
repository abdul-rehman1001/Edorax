import type { ChapterReaderView } from '../../../server/src/shared/api/reader';
import type { BlockState } from '../../../server/src/shared/api/blocks';
export type { BlockState };
export type LessonNode = {
  type: string;
  value?: string;
  lang?: string;
  meta?: string;
  name?: string;
  depth?: number;
  url?: string;
  ordered?: boolean;
  attributes?: Record<string, unknown>;
  children?: LessonNode[];
};
export type Lesson = ChapterReaderView & { document: LessonNode };
export type AnswerResult = {
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number | null;
  status?: string;
  explanation?: string;
};
