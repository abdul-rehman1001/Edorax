import type { QuizChapterState } from "../../shared/api/blocks.js";
import { QuizConfigSchema } from "../../shared/blocks/quiz/schema.js";
import { applyTokens, contentTokenValues, hasContentTokens } from "../../shared/lib/content-tokens.js";
import { prisma } from "../../db/prisma.js";
import { releaseContainsChapter } from "../courses/releases.js";
import { NotFoundError } from "../../utils/errors.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { calculateQuizAssessment } from "../progress/quiz-assessment.js";
import { visibleExplanation } from "../../shared/lib/quiz-feedback.js";

/** Initial state for a quiz-mode chapter's wizard: last answers, grades and the score once every question is attempted. */
export async function loadQuizChapterState(chapterId: string, userId: string): Promise<QuizChapterState> {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { courseId: true, quizPassingScore: true, course: { select: { familySlug: true, variantFamily: true } } } });
  if (!chapter) throw new NotFoundError("Chapter not found");
  const enrollment = await prisma.enrollment.findUnique({ where: { courseId_userId: { courseId: chapter.courseId, userId } }, select: { id: true, releaseId: true, variantSlug: true } });
  if (enrollment && !(await releaseContainsChapter(chapter.courseId, enrollment, chapter.course.familySlug, chapterId))) throw new NotFoundError("Chapter not found");
  const blocks = await prisma.block.findMany({
    where: { chapterId, archivedAt: null, type: { in: ["QUIZ", "OPEN_QUESTION", "PREDICT", "CODE"] } },
    orderBy: { order: "asc" },
    select: { id: true, type: true, config: true },
  });
  const steps: QuizChapterState["steps"] = blocks.map(block => ({ id: block.id, type: block.type as QuizChapterState["steps"][number]["type"] }));
  const quizBlocks = blocks.filter(block => block.type === "QUIZ");
  const blockIds = quizBlocks.map((block) => block.id);
  const responses = await prisma.response.findMany({
    where: { blockId: { in: blocks.map((block) => block.id) }, userId, status: { not: "DRAFT" } },
    orderBy: { attempt: "desc" },
  });
  const latestByBlock = new Map<string, (typeof responses)[number]>();
  for (const response of responses) {
    if (!latestByBlock.has(response.blockId)) latestByBlock.set(response.blockId, response);
  }
  const selectedFor = (blockId: string) => {
    const payload = latestByBlock.get(blockId)?.payload as { selected?: unknown } | undefined;
    return Array.isArray(payload?.selected) ? payload.selected.filter((item): item is string => typeof item === "string") : [];
  };

  const tokens = quizBlocks.some((block) => hasContentTokens(JSON.stringify(block.config))) ? await learnerTokenValues(chapterId, userId) : null;
  const chapterComplete = enrollment
    ? (await prisma.chapterProgress.findUnique({
        where: { enrollmentId_chapterId: { enrollmentId: enrollment.id, chapterId } },
        select: { status: true },
      }))?.status === "COMPLETED"
    : false;
  const assessment = calculateQuizAssessment({
    blocks,
    responses: [...latestByBlock.values()].map((response) => ({
      blockId: response.blockId,
      status: response.status,
      score: response.score,
      maxScore: response.maxScore,
    })),
    passingScore: chapter.quizPassingScore,
  });
  // A finished submission may show every option's explanation and the right answer.
  const revealAll = chapterComplete || assessment?.passed === true;

  const initialBlockGrades: QuizChapterState["initialBlockGrades"] = {};
  for (const block of quizBlocks) {
    const response = latestByBlock.get(block.id);
    if (!response) continue;
    const parsed = QuizConfigSchema.safeParse(block.config);
    const selected = selectedFor(block.id);
    const reveal = revealAll || response.isCorrect === true || (parsed.success && parsed.data.allowRetry === false);
    // Same rule as single quiz blocks: a wrong answer only reveals the lines about what was picked.
    const explanation = parsed.success
      ? visibleExplanation({
          explanation: parsed.data.explanation,
          options: parsed.data.options,
          selected,
          isCorrect: response.isCorrect,
          allowRetry: reveal ? false : parsed.data.allowRetry,
        })
      : undefined;
    initialBlockGrades[block.id] = {
      selected,
      isCorrect: response.isCorrect,
      explanation: explanation && tokens ? applyTokens(explanation, tokens) : explanation,
      ...(reveal && parsed.success ? { correctOptionIds: parsed.data.correctOptionIds } : {}),
    };
  }

  const allAttempted = blockIds.every((blockId) => latestByBlock.has(blockId));
  return {
    steps,
    blockIds,
    initialAnswers: Object.fromEntries(blockIds.map((blockId) => [blockId, selectedFor(blockId)])),
    initialBlockGrades,
    initialScoreSummary: blockIds.length > 0 && allAttempted
      ? {
          score: blockIds.reduce((total, id) => total + (latestByBlock.get(id)?.score ?? 0), 0),
          maxScore: blockIds.reduce((total, id) => total + (latestByBlock.get(id)?.maxScore ?? 0), 0),
          questions: blockIds.length,
        }
      : null,
    assessment,
  };
}

/** The learner's placeholder values, looked up only when a quiz actually uses a placeholder. */
async function learnerTokenValues(chapterId: string, userId: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId, archivedAt: null }, select: { courseId: true, course: { select: { familySlug: true, variantFamily: true } } } });
  const enrollment = chapter?.course.familySlug
    ? await prisma.enrollment.findUnique({ where: { courseId_userId: { courseId: chapter.courseId, userId } }, select: { variantSlug: true } })
    : null;
  return contentTokenValues(resolveCourseFamily(chapter?.course.familySlug, chapter?.course.variantFamily), enrollment?.variantSlug);
}
