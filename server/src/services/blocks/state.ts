import type { BlockState, ContentBlockState } from "../../shared/api/blocks.js";
import { blockDefinitions } from "../../shared/blocks/definitions.js";
import { AiInterviewConfigSchema, type SanitizedAiInterviewConfig } from "../../shared/blocks/ai-interview/schema.js";
import { CodeConfigSchema, type SanitizedCodeConfig } from "../../shared/blocks/code/schema.js";
import { MustReadConfigSchema } from "../../shared/blocks/must-read/schema.js";
import {
  shouldLlmGradeOpenQuestion,
  OpenQuestionConfigSchema,
  type OpenQuestionStoredPayload,
  type SanitizedOpenQuestionConfig,
} from "../../shared/blocks/open-question/schema.js";
import { getOpenQuestionGroupPosition } from "../../shared/blocks/open-question/group-position.js";
import { PredictConfigSchema, type SanitizedPredictConfig } from "../../shared/blocks/predict/schema.js";
import { QuizConfigSchema, type SanitizedQuizConfig } from "../../shared/blocks/quiz/schema.js";
import { applyTokens, applyTokensDeep, contentTokenValues, type ContentTokenValues } from "../../shared/lib/content-tokens.js";
import { prisma } from "../../db/prisma.js";
import type { Block } from "../../generated/prisma/index.js";
import { findEnrollmentForBlockState, requireBlockSubmissionAccess } from "../enrollment/api-learn-access.js";
import { loadAiInterviewInitialState } from "../ai/interview/service.js";
import { getAiCredentialStatus } from "../ai/credentials.js";
import { NotFoundError } from "../../utils/errors.js";
import { sanitizeBlockConfig } from "../../utils/sanitize-block-config.js";
import type { SessionUser } from "../../types/auth.js";
import { releaseContainsChapter } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { visibleExplanation } from "../../shared/lib/quiz-feedback.js";

type Payload = Record<string, unknown> | null;

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * Client-safe config plus the caller's latest answer. Anonymous callers (course
 * previews) get the config only. Secrets never leave: answer keys, rubrics,
 * hidden tests and solutions are stripped before the config is returned.
 */
export async function loadBlockState(blockId: string, user: SessionUser | undefined): Promise<BlockState> {
  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: {
      chapter: {
        select: {
          id: true,
          archivedAt: true,
          course: { select: { id: true, familySlug: true, variantFamily: true, autoGradeOpenQuestions: true, pricingType: true, mentorId: true } },
        },
      },
    },
  });
  if (!block || block.archivedAt || block.chapter.archivedAt) throw new NotFoundError("Block not found");

  // Prompts and options read in the caller's variant; anonymous previews get the fallbacks.
  const { course } = block.chapter;
  let enrollment = user ? await findEnrollmentForBlockState(course.id, user.id) : null;
  if (course.pricingType === "PAID") {
    const isCourseInstructor = user && (user.role === "MENTOR" || user.role === "ADMIN") &&
      (user.role === "ADMIN" || course.mentorId === user.id || Boolean(await prisma.courseInstructor.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: user.id } }, select: { id: true },
      })));
    if (!isCourseInstructor) {
      enrollment = await requireBlockSubmissionAccess(course.id, user);
    }
  }
  if (enrollment && !(await releaseContainsChapter(course.id, enrollment, course.familySlug, block.chapter.id))) throw new NotFoundError("Block not found");
  return withTokens(
    await blockStateFor(block, user, { autoGradeOpenQuestions: course.autoGradeOpenQuestions }),
    contentTokenValues(resolveCourseFamily(course.familySlug, course.variantFamily), enrollment?.variantSlug),
  );
}

/** Resolve placeholders in what the author wrote (config and explanations), never in the learner's own answer. */
function withTokens(state: BlockState, values: ContentTokenValues): BlockState {
  const config = applyTokensDeep(state.config, values);
  if (!("initialState" in state) || !state.initialState || !("explanation" in state.initialState)) return { ...state, config } as BlockState;
  const { explanation } = state.initialState;
  return {
    ...state,
    config,
    initialState: { ...state.initialState, explanation: typeof explanation === "string" ? applyTokens(explanation, values) : explanation },
  } as BlockState;
}

async function blockStateFor(
  block: Block,
  user: SessionUser | undefined,
  options: { autoGradeOpenQuestions?: boolean } = {},
): Promise<BlockState> {
  const blockId = block.id;

  const latest = user
    ? await prisma.response.findFirst({
        where: { blockId, userId: user.id },
        orderBy: { attempt: "desc" },
        include: { review: { select: { feedback: true, verdict: true } } },
      })
    : null;
  const payload = (latest?.payload ?? null) as Payload;

  switch (block.type) {
    case "QUIZ": {
      const config = QuizConfigSchema.parse(block.config);
      return {
        type: "QUIZ",
        config: sanitizeBlockConfig<typeof config, SanitizedQuizConfig>(config),
        initialState: latest
          ? { selected: strings(payload?.selected), isCorrect: latest.isCorrect, score: latest.score, maxScore: latest.maxScore, explanation: visibleExplanation({ explanation: config.explanation, options: config.options, selected: strings(payload?.selected), isCorrect: latest.isCorrect, allowRetry: config.allowRetry }) }
          : null,
      };
    }
    case "PREDICT": {
      const config = PredictConfigSchema.parse(block.config);
      return {
        type: "PREDICT",
        config: sanitizeBlockConfig<typeof config, SanitizedPredictConfig>(config),
        initialState: latest
          ? { selected: str(payload?.selected), isCorrect: latest.isCorrect, score: latest.score, maxScore: latest.maxScore, explanation: visibleExplanation({ explanation: config.explanation, options: config.options, selected: [str(payload?.selected)], isCorrect: latest.isCorrect, allowRetry: config.allowRetry }) }
          : null,
      };
    }
    case "CODE": {
      const config = CodeConfigSchema.parse(block.config);
      return {
        type: "CODE",
        config: sanitizeBlockConfig<typeof config, SanitizedCodeConfig>(config),
        initialState: latest ? { source: str(payload?.source, config.starterCode), isCorrect: latest.isCorrect } : null,
      };
    }
    case "OPEN_QUESTION": {
      const config = OpenQuestionConfigSchema.parse(block.config);
      const chapterBlocks = await prisma.block.findMany({
        where: { chapterId: block.chapterId, archivedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, type: true },
      });
      const submitted = latest && latest.status !== "DRAFT" ? latest : null;
      const stored = (payload ?? null) as OpenQuestionStoredPayload | null;
      const llmFeedback = stored?.llmFeedback;
      const llmMode = shouldLlmGradeOpenQuestion(config, options.autoGradeOpenQuestions ?? false);
      const aiStatus = llmMode
        ? user?.id
          ? await getAiCredentialStatus(user.id)
          : { configured: false, hasKey: false }
        : null;
      const clientConfig = sanitizeBlockConfig<typeof config, SanitizedOpenQuestionConfig>(config);
      return {
        type: "OPEN_QUESTION",
        // Course-level auto-grade must look like llm mode so the learner UI asks for an OpenRouter key.
        config: llmMode ? { ...clientConfig, autoGrade: "llm" as const } : clientConfig,
        group: getOpenQuestionGroupPosition(chapterBlocks, blockId),
        ...(aiStatus
          ? { ai: { configured: aiStatus.configured, hasKey: aiStatus.hasKey } }
          : {}),
        initialState: submitted
          ? {
              status: submitted.status,
              attempt: llmMode ? (llmFeedback?.attempt ?? submitted.attempt) : submitted.attempt,
              text: str(payload?.text),
              url: typeof payload?.url === "string" ? payload.url : null,
              feedback: submitted.review?.feedback ?? null,
              verdict: submitted.review?.verdict ?? null,
              ...(llmMode
                ? {
                    isCorrect: submitted.isCorrect,
                    explanation: llmFeedback?.why ?? null,
                    hint: llmFeedback?.hint ?? null,
                    guidance: llmFeedback?.guidance ?? null,
                  }
                : {}),
            }
          : null,
      };
    }
    case "MUST_READ": {
      const config = MustReadConfigSchema.parse(block.config);
      return {
        type: "MUST_READ",
        config: { title: config.title, url: config.url, description: config.description, source: config.source, readMinutes: config.readMinutes },
        // Progress reads Block.required (see progress/rules.ts), so the card follows the same flag.
        required: block.required,
        initialRead: Boolean(latest && latest.status !== "DRAFT"),
      };
    }
    case "AI_INTERVIEW": {
      const config = AiInterviewConfigSchema.parse(block.config);
      return {
        type: "AI_INTERVIEW",
        // sanitizeBlockConfig drops the rubric (a SECRET_KEY) along with every other server-only field.
        config: sanitizeBlockConfig<typeof config, SanitizedAiInterviewConfig>(config),
        initialState: await loadAiInterviewInitialState(user?.id, blockId, config),
      };
    }
    case "STEPS":
    case "VIDEO":
    case "CHAPTER_RECAP":
    case "LEARNING_OBJECTIVES":
    case "PROJECT_PREVIEW":
    case "ROADMAP":
    case "VISUAL_DIAGRAM":
    case "VISUAL_WALKTHROUGH":
      // Presentation blocks: the config is the content, nothing in it is secret.
      return { type: block.type, config: blockDefinitions[block.type].schema.parse(block.config) } as ContentBlockState;
    default:
      throw new NotFoundError(`Block type ${block.type} has no learner state`);
  }
}
