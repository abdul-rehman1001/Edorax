/**
 * Imports one course folder under courses/ into the real Course /
 * Module / Chapter / Block tables. Pick it with `--course <slug>`; the default
 * is multi-vendor-marketplace (see course-source.ts).
 *
 * This is a *structural* import, not a rewrite (see the chat decision this
 * script implements): the mentor's prose is kept close to verbatim. The two
 * things it actively transforms are:
 *
 *   1. Explicit interactive fences (`quiz`, `openquestion`, `predict`, `aiinterview`, `codeexercise`) become
 *      registered blocks, with grading-only config kept server-side.
 *   2. Explicit presentation components such as ChapterRecap and ProjectPreview
 *      become registered presentation blocks.
 *
 * The importer never invents learner interactions. A reflection, quiz, or
 * mentor-reviewed answer must be authored intentionally in the source lesson.
 *
 * Re-running upserts Modules/Chapters by (courseId, order) / (courseId, slug).
 * Identical blocks keep their ids and learner responses. A changed answered
 * block is archived; a changed unanswered block is removed.
 *
 * Run: pnpm content:import [--course <slug>]
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { ulid } from "ulid";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/index.js";
import { courseCategoryFromSource } from "../src/shared/domain/enums.js";
import { SEED_COURSE, SEED_USERS } from "../src/shared/lib/seed-data.js";
import { VideoConfigSchema } from "../src/shared/blocks/video/schema.js";
import { QuizConfigSchema, normalizeQuizConfig } from "../src/shared/blocks/quiz/schema.js";
import { VisualWalkthroughConfigSchema } from "../src/shared/blocks/visual-walkthrough/schema.js";
import { VisualDiagramConfigSchema } from "../src/shared/blocks/visual-diagram/schema.js";
import { RoadmapConfigSchema } from "../src/shared/blocks/roadmap/schema.js";
import { AiInterviewFenceSchema } from "../src/shared/blocks/ai-interview/schema.js";
import { COURSE_SOURCE_DIR, loadCourseManifest, type CourseManifest } from "./course-source.js";
import { recomputeEnrollmentRollup } from "../src/services/progress/compute.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** FreshMarket module titles. Courses with a course.yaml take titles from it instead. */
const CHAPTER_NAMES: Record<number, string> = {
  1: "Introduction",
  2: "Project skeleton",
  3: "Why MongoDB",
  4: "Config and database",
  5: "Data model and seed",
  6: "Authentication API",
  7: "Login and registration",
  8: "Authorization and isolation",
  9: "Vendor store API",
  10: "Open your shop",
  11: "Manage products API",
  12: "Vendor dashboard",
  13: "Product photos",
  14: "Browse catalogue API",
  15: "Shop the marketplace",
  16: "Cart API",
  17: "Your cart",
  18: "Checkout and orders",
  19: "Payment processing",
  20: "Track orders",
  21: "Cache and search",
  22: "Async jobs and queues",
  23: "Deploy",
  24: "Inventory reservations",
  25: "Promotions & pricing",
  99: "Closing",
};

export type PendingBlock = {
  id: string;
  type: "QUIZ" | "OPEN_QUESTION" | "CHAPTER_RECAP" | "PROJECT_PREVIEW" | "LEARNING_OBJECTIVES" | "CODE" | "PREDICT" | "MUST_READ" | "VIDEO" | "VISUAL_WALKTHROUGH" | "VISUAL_DIAGRAM" | "ROADMAP" | "AI_INTERVIEW";
  config: Prisma.InputJsonValue;
  required: boolean;
};

function stableConfig(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

/** Preserve an existing block id when the learner-facing activity is identical. */
async function reconcileBlockIds(chapterId: string, lesson: ParsedLesson) {
  const existing = await prisma.block.findMany({
    where: { chapterId, archivedAt: null },
    select: { id: true, type: true, config: true, _count: { select: { responses: true } } },
  });
  const unmatched = new Set(existing.map((block) => block.id));

  for (const block of lesson.blocks) {
    const match = existing.find((old) =>
      unmatched.has(old.id) && old.type === block.type && stableConfig(old.type === "QUIZ" ? normalizeQuizConfig(old.config) : old.config) === stableConfig(block.config)
    );
    if (!match) continue;
    lesson.source = lesson.source.replaceAll(block.id, match.id);
    block.id = match.id;
    unmatched.delete(match.id);
  }

  return existing.filter((block) => unmatched.has(block.id));
}

function blockPlaceholderTag(block: PendingBlock): string {
  const tag =
    block.type === "QUIZ"
      ? "Quiz"
      : block.type === "CHAPTER_RECAP"
          ? "ChapterRecap"
          : block.type === "PROJECT_PREVIEW"
            ? "ProjectPreview"
            : block.type === "PREDICT"
              ? "Predict"
              : block.type === "CODE"
                ? "CodeExercise"
              : block.type === "LEARNING_OBJECTIVES"
                  ? "LearningObjectives"
                  : block.type === "MUST_READ"
                    ? "MustRead"
                    : block.type === "VIDEO"
                      ? "VideoBlock"
                      : block.type === "VISUAL_WALKTHROUGH"
                        ? "VisualWalkthrough"
                        : block.type === "VISUAL_DIAGRAM"
                          ? "VisualDiagram"
                          : block.type === "ROADMAP"
                            ? "Roadmap"
                            : block.type === "AI_INTERVIEW"
                              ? "AiInterview"
                              : "OpenQuestion";
  return `<${tag} id="${block.id}" />`;
}

/**
 * Link-only visual blocks use YAML fences so imports stay deterministic and
 * images never require an upload subsystem. The schema is also the publish
 * gate: malformed/unsafe links remain source text instead of becoming blocks.
 */
function transformVisualContentFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  const normalizedPortable = body.replace(/^```(canvas|lab)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm, (match, kind: "canvas" | "lab", yamlText: string) => {
    try {
      const parsed = loadYaml(yamlText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return match;
      return `\`\`\`${kind}\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      return match;
    }
  });
  const fenceTypes = {
    video: { type: "VIDEO", schema: VideoConfigSchema },
    walkthrough: { type: "VISUAL_WALKTHROUGH", schema: VisualWalkthroughConfigSchema },
    diagram: { type: "VISUAL_DIAGRAM", schema: VisualDiagramConfigSchema },
    roadmap: { type: "ROADMAP", schema: RoadmapConfigSchema },
  } as const;
  return normalizedPortable.replace(/```(video|walkthrough|diagram|roadmap)\n([\s\S]*?)```/g, (match, name: keyof typeof fenceTypes, yamlText: string) => {
    let parsed: unknown;
    try {
      parsed = loadYaml(yamlText);
    } catch {
      return match;
    }
    const definition = fenceTypes[name];
    const result = definition.schema.safeParse(parsed);
    if (!result.success) return match;
    return pushBlock({
      id: ulid(),
      type: definition.type,
      required: false,
      config: result.data as Prisma.InputJsonValue,
    });
  });
}

function parseJsxStringAttr(source: string, attr: string): string | undefined {
  const match = source.match(new RegExp(`${attr}="([^"]*)"`));
  return match?.[1];
}

/** Reads `attr="true|false"` or `attr={true|false}`. Anything else is undefined. */
function parseJsxBooleanAttr(source: string, attr: string): boolean | undefined {
  const match = source.match(new RegExp(`\\b${attr}=(?:"(true|false)"|\\{(true|false)\\})`));
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? undefined : value === "true";
}

function parseJsxStringArray(source: string, attr: string): string[] | undefined {
  const match = source.match(new RegExp(`${attr}=\\{\\[([\\s\\S]*?)\\]\\}`));
  if (!match?.[1]) return undefined;
  const items: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let item: RegExpExecArray | null;
  while ((item = re.exec(match[1])) !== null) {
    items.push(item[1]!.replace(/\\"/g, '"'));
  }
  return items.length > 0 ? items : undefined;
}

/** Inline presentation JSX -> registered blocks with stable id placeholders. */
export function transformPresentationBlocks(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/<(ChapterRecap|ProjectPreview|LearningObjectives|MustRead|VideoBlock)([\s\S]*?)\/>/g, (full, tagName: string, attrs: string) => {
    if (/\bid=/.test(attrs)) return full;

    const pseudo = `<X${attrs}/>`;

    if (tagName === "MustRead") {
      const title = parseJsxStringAttr(pseudo, "title");
      const url = parseJsxStringAttr(pseudo, "url") ?? parseJsxStringAttr(pseudo, "href");
      const description = parseJsxStringAttr(pseudo, "description") ?? parseJsxStringAttr(pseudo, "summary");
      const source = parseJsxStringAttr(pseudo, "source");
      const readMinutesStr = parseJsxStringAttr(pseudo, "readMinutes");
      const readMinutes = readMinutesStr ? Number(readMinutesStr) : undefined;
      if (!title || !url || !description) return full;
      // `required="false"` (or `required={false}`) keeps an example or bonus read
      // out of the chapter's completion rule. Everything else stays required.
      const required = parseJsxBooleanAttr(pseudo, "required") ?? true;
      return pushBlock({
        id: ulid(),
        type: "MUST_READ",
        required,
        config: {
          title,
          url,
          description,
          ...(source ? { source } : {}),
          ...(readMinutes ? { readMinutes } : {}),
          completionRule: "confirm_read",
        },
      });
    }

    if (tagName === "VideoBlock") {
      const title = parseJsxStringAttr(pseudo, "title");
      const sourceUrl = parseJsxStringAttr(pseudo, "sourceUrl") ?? parseJsxStringAttr(pseudo, "src");
      const caption = parseJsxStringAttr(pseudo, "caption");
      const transcriptUrl = parseJsxStringAttr(pseudo, "transcriptUrl");
      if (!title || !sourceUrl) return full;
      return pushBlock({
        id: ulid(),
        type: "VIDEO",
        required: false,
        config: {
          title,
          sourceUrl,
          ...(caption ? { caption } : {}),
          ...(transcriptUrl ? { transcriptUrl } : {}),
        },
      });
    }

    if (tagName === "LearningObjectives") {
      const objectives = parseJsxStringArray(pseudo, "items") ?? parseJsxStringArray(pseudo, "objectives");
      if (!objectives?.length) return full;
      return pushBlock({
        id: ulid(),
        type: "LEARNING_OBJECTIVES",
        required: false,
        config: { objectives },
      });
    }

    if (tagName === "ChapterRecap") {
      const points = parseJsxStringArray(pseudo, "points");
      if (!points?.length) return full;
      return pushBlock({
        id: ulid(),
        type: "CHAPTER_RECAP",
        required: false,
        config: { points },
      });
    }

    const title = parseJsxStringAttr(pseudo, "title");
    const description = parseJsxStringAttr(pseudo, "description");
    const features = parseJsxStringArray(pseudo, "features");
    const techStack = parseJsxStringArray(pseudo, "techStack");
    const imageUrl = parseJsxStringAttr(pseudo, "imageUrl");
    if (!title || !description || !features?.length) return full;

    const config: Record<string, unknown> = { title, description, features };
    if (techStack?.length) config.techStack = techStack;
    if (imageUrl) config.imageUrl = imageUrl;

    return pushBlock({
      id: ulid(),
      type: "PROJECT_PREVIEW",
      required: false,
      config: config as Prisma.InputJsonValue,
    });
  });
}

/**
 * ```codeexercise YAML becomes a CODE block. Tests and solution are stored in
 * Block.config only; the resulting MDX contains just the stable reference.
 */
function transformCodeExerciseFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/```(?:codeexercise|code-exercise)\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: {
      prompt: string;
      starterCode: string;
      tests: Array<{ name: string; code: string }>;
      mode?: "complete" | "implement";
      language?: "javascript";
      filename?: string;
      hints?: string[];
      explanation?: string;
      solution?: string;
      allowRetry?: boolean;
      required?: boolean;
    };
    try {
      parsed = loadYaml(yamlText) as typeof parsed;
    } catch {
      return match;
    }
    if (!parsed?.prompt || !parsed.starterCode || !Array.isArray(parsed.tests) || parsed.tests.length === 0) {
      return match;
    }
    if (!parsed.tests.every((test) => typeof test?.name === "string" && typeof test?.code === "string")) {
      return match;
    }
    return pushBlock({
      id: ulid(),
      type: "CODE",
      required: parsed.required ?? true,
      config: {
        mode: parsed.mode ?? "implement",
        language: parsed.language ?? "javascript",
        prompt: parsed.prompt,
        starterCode: parsed.starterCode,
        tests: parsed.tests,
        filename: parsed.filename,
        hints: parsed.hints,
        explanation: parsed.explanation,
        solution: parsed.solution,
        allowRetry: parsed.allowRetry ?? true,
      },
    });
  });
}

type ParsedLesson = {
  moduleNum: number;
  lessonNum: number;
  slugPart: string;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
  readerMode: "DEFAULT" | "QUIZ";
  quizPassingScore: number;
  source: string;
  blocks: PendingBlock[];
  isMilestone: boolean;
};

export function readModuleDirs(): { dirName: string; moduleNum: number }[] {
  return fs
    .readdirSync(COURSE_SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+-/.test(entry.name))
    .map((entry) => ({ dirName: entry.name, moduleNum: Number(entry.name.match(/^(\d+)-/)![1]) }))
    .sort((a, b) => a.moduleNum - b.moduleNum);
}

export function readLessonFiles(moduleDir: string): { fileName: string; lessonNum: number; slugPart: string }[] {
  return fs
    .readdirSync(path.join(COURSE_SOURCE_DIR, moduleDir))
    .filter((name) => /^\d+\.\d+-.+\.md$/.test(name))
    .map((name) => {
      const match = name.match(/^\d+\.(\d+)-(.+)\.md$/)!;
      return { fileName: name, lessonNum: Number(match[1]), slugPart: match[2] };
    })
    .sort((a, b) => a.lessonNum - b.lessonNum);
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter = (loadYaml(match[1]) as Record<string, unknown>) ?? {};
  return { frontmatter, body: match[2] };
}

function cleanTitle(rawTitle: string | undefined, fallback: string): string {
  if (!rawTitle) return fallback;
  return rawTitle.replace(/^\d+\.\d+\s+—\s+/, "").trim() || fallback;
}

/** Removes the internal step-type banner — mentees don't need `[Learn] · Chapter …`. */
function stripStepTypeBlockquote(body: string): string {
  return body.replace(/^> \*\*\[(?:Read|Learn|Build|Gate|Check|Wrap)\]\*\*[^\n]*\n\n?/m, "");
}

/** Title is shown in the reader chrome — drop the duplicate `# 6.6 — …` heading. */
function stripLeadingH1(body: string): string {
  return body.replace(/^# \d+\.\d+ — [^\n]+\n\n?/, "");
}

/** ArticleBreak was decorative only. Keep its prose while removing its wrapper. */
function unwrapArticleBreak(body: string): string {
  return body.replace(/<ArticleBreak\b[^>]*>\s*([\s\S]*?)\s*<\/ArticleBreak>/g, "$1");
}

function isFocusChapter(fileName: string): boolean {
  return /-checklist\.md$/.test(fileName) || /-quiz\.md$/.test(fileName);
}

function isGateChecklistChapter(fileName: string): boolean {
  return /-checklist\.md$/.test(fileName) || fileName.includes("production-env-checklist");
}

/**
 * Gate/quiz chapters should stay focused: no glossary cards or optional reads.
 * A gate keeps its ChapterRecap, because agent-ip puts the module recap at the
 * gate (02-course-architecture.md). A quiz chapter holds activities only.
 */
function stripFocusChapterEnrichment(body: string, keepRecap: boolean): string {
  const focused = body
    .replace(/<BigWordAlert[\s\S]*?\/>/g, "")
    .replace(/<RealWorldEvent[\s\S]*?\/>/g, "")
    .replace(/<MustRead[\s\S]*?\/>/g, "")
    .replace(/<InterestingRead[\s\S]*?<\/InterestingRead>/g, "");
  return (keepRecap ? focused : focused.replace(/<ChapterRecap[\s\S]*?\/>/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Many gate checklists embed `### Learning log — write now` mid-checklist.
 * Move it to `## Learning log` right before "All boxes ticked?" — matches 3-10 layout.
 */
function normalizeGateLearningLog(body: string): string {
  const match = body.match(
    /(?:^|\n)###\s+Learning log[^\n]*\n\n([\s\S]*?)(?=\n##\s+)/
  );
  if (!match) return body;

  const section = match[1]!.trim();
  if (!/^\d+\.\s/m.test(section)) return body;

  const without = body.replace(match[0], "\n").replace(/\n{3,}/g, "\n\n");
  const block = `## Learning log\n\n${section}\n\n`;

  if (/## All boxes ticked/i.test(without)) {
    return without.replace(/(## All boxes ticked)/i, `${block}$1`);
  }
  return `${without.trim()}\n\n${block}`;
}

function escapeMdxInline(text: string): string {
  return text.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/</g, "&lt;");
}

/**
 * MDX treats bare `{` and `<letter` outside of code as JS expressions / JSX.
 * Escape with HTML entities in prose only — fenced code blocks, inline code,
 * and custom MDX blocks are left verbatim.
 */
function escapeMdxProse(body: string): string {
  const blockTags: string[] = [];
  let withMarkers = body.replace(/<FaqGroup>[\s\S]*?<\/FaqGroup>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<CheckpointIntro>[\s\S]*?<\/CheckpointIntro>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<MustRead[\s\S]*?\/>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<BigWordAlert[\s\S]*?\/>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<RealWorldEvent[\s\S]*?\/>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<InterestingRead[\s\S]*?<\/InterestingRead>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<Callout[\s\S]*?<\/Callout>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<ApiRequestPanel[\s\S]*?<\/ApiRequestPanel>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  const contentBlockPairs = [
    "ComparePanel",
    "FileTree",
    "TerminalBlock",
    "ArchitectureDiagram",
    "TraceRequest",
  ] as const;
  for (const tag of contentBlockPairs) {
    const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "g");
    withMarkers = withMarkers.replace(re, (tagContent) => {
      blockTags.push(tagContent);
      return `\x00BLOCK${blockTags.length - 1}\x00`;
    });
  }
  withMarkers = withMarkers.replace(/<(DiffBlock|MermaidDiagram|InteractiveCanvas|EcosystemGallery|Roadmap)[\s\S]*?\/>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });
  withMarkers = withMarkers.replace(/<(Quiz|OpenQuestion|CodeExercise|ChapterRecap|ProjectPreview|LearningObjectives|Predict|AiInterview|MustRead|VideoBlock|VisualWalkthrough|VisualDiagram|Roadmap|Steps)\s+id="[^"]+"\s*\/>/g, (tag) => {
    blockTags.push(tag);
    return `\x00BLOCK${blockTags.length - 1}\x00`;
  });

  const escaped = splitOutsideFences(withMarkers, /^```[\s\S]*?^```[ \t]*$/gm, (segment) => {
    return splitOutsideFences(segment, /`[^`\n]+`/g, (prose) =>
      prose.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/</g, "&lt;")
    );
  });

  return escaped.replace(/\x00BLOCK(\d+)\x00/g, (_, index) => blockTags[Number(index)]!);
}

/** Replace vague `https://...` placeholders with concrete example domains. */
function normalizePlaceholderUrls(body: string): string {
  const fix = (text: string) =>
    text
      .replace(/https:\/\/api\.\.\./g, "https://api.yourdomain.com")
      .replace(/https:\/\/app\.\.\./g, "https://app.yourdomain.com")
      .replace(/https:\/\/\.\.\./g, "https://your-domain.com");

  return splitOutsideFences(body, /^```[\s\S]*?^```[ \t]*$/gm, fix);
}

type FaqPair = { question: string; answer: string };

function parseFaqPairs(section: string): FaqPair[] {
  const items: FaqPair[] = [];
  const blocks = section.trim().split(/\n\n+/);

  let current: FaqPair | null = null;
  for (const block of blocks) {
    const match = block.match(/^\*\*Q:\s*(.+?)\*\*\s*\n(?:A:\s*)?([\s\S]*)$/);
    if (match) {
      current = { question: match[1]!.trim(), answer: match[2]!.trim() };
      items.push(current);
    } else if (current) {
      current.answer = `${current.answer}\n\n${block.trim()}`;
    }
  }
  return items;
}

/**
 * Turn prose Q/A lists into structured FaqGroup MDX.
 * Stop before the next heading or a block-level component so a diagram that
 * follows the questions is not folded into the last answer and escaped.
 * Question text is a JS string expression — JSX quoted attributes do not
 * understand `\"`, so a comma after an escaped quote breaks the tag.
 */
function transformFaqSections(body: string): string {
  return body.replace(
    /(?:^|\n)(## Common (?:beginner )?questions)\n\n([\s\S]*?)(?=\n## |\n<[A-Z]|\s*$)/g,
    (full, heading: string, section: string) => {
      const pairs = parseFaqPairs(section);
      if (pairs.length === 0) return full;

      const items = pairs
        .map(({ question, answer }) => {
          const questionAttr = `{${JSON.stringify(question)}}`;
          return `<FaqItem question=${questionAttr}>\n\n${escapeMdxInline(answer)}\n\n</FaqItem>`;
        })
        .join("\n\n");

      const prefix = full.startsWith("\n") ? "\n" : "";
      return `${prefix}${heading}\n\n<FaqGroup>\n\n${items}\n\n</FaqGroup>\n\n`;
    }
  );
}

/** Runs `transform` over the parts of `text` that do NOT match `pattern`, leaving matches untouched. */
function splitOutsideFences(text: string, pattern: RegExp, transform: (part: string) => string): string {
  const parts = text.split(pattern);
  const matches = text.match(pattern) ?? [];
  return parts.map((part, i) => (i < parts.length - 1 ? transform(part) + matches[i] : transform(part))).join("");
}

/** ```predict``` fenced YAML -> Predict block + placeholder tag. */
function transformPredictFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/```predict\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: {
      prompt: string;
      options: { id: string; label: string }[];
      correctOptionId: string;
      explanation?: string;
      allowRetry?: boolean;
      context?: {
        method?: string;
        url?: string;
        bearer?: string;
        responseHint?: string;
      };
    };
    try {
      parsed = loadYaml(yamlText) as typeof parsed;
    } catch {
      return match;
    }
    if (!parsed?.prompt || !parsed.options?.length || !parsed.correctOptionId) return match;

    const id = ulid();
    return pushBlock({
      id,
      type: "PREDICT",
      required: false,
      config: {
        prompt: parsed.prompt,
        options: parsed.options,
        correctOptionId: parsed.correctOptionId,
        explanation: parsed.explanation,
        allowRetry: parsed.allowRetry ?? true,
        context: parsed.context,
      },
    });
  });
}

/**
 * ```aiinterview``` fenced YAML -> AiInterview block + placeholder tag. Unlike the
 * lenient fences above, a malformed one stops the import with the reason: the
 * block holds a server-only rubric and a misspelled key would silently drop it.
 */
function transformAiInterviewFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/```aiinterview\n([\s\S]*?)```/g, (_match, yamlText: string) => {
    let parsed: unknown;
    try {
      parsed = loadYaml(yamlText);
    } catch {
      throw new Error("aiinterview fence: the YAML could not be read.");
    }
    const result = AiInterviewFenceSchema.safeParse(parsed);
    if (!result.success) {
      const reasons = result.error.issues.map((issue) => `${issue.path.join(".") || "fence"}: ${issue.message}`);
      throw new Error(`aiinterview fence is invalid (${reasons.join("; ")}).`);
    }
    const { required, ...config } = result.data;
    return pushBlock({
      id: ulid(),
      type: "AI_INTERVIEW",
      // Needs the learner's own OpenRouter key, so it does not gate a chapter unless the author says so.
      required: required ?? false,
      config: config as Prisma.InputJsonValue,
    });
  });
}

/**
 * One explanation string for the learner, shown after they answer. `explanations` holds one
 * reason per option, in option order, so every choice (right or wrong) gets its own feedback.
 */
function quizExplanation(options: (string | number | boolean)[], explanation?: string, explanations?: string[]): string | undefined {
  // One line per option ("Option" reason) so the quiz feedback reads as a list, not one paragraph.
  const perOption = (explanations ?? []).map((why, i) => (options[i] !== undefined ? `"${options[i]}" ${why}` : why));
  const text = [explanation, ...perOption].filter((part) => part?.trim()).join("\n");
  return text || undefined;
}

/** ```quiz``` fenced YAML -> real Quiz/OpenQuestion blocks + placeholder tags. */
function transformQuizFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/```quiz\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: {
      type: "mcq" | "short";
      question: string;
      options?: (string | number | boolean)[];
      correct?: number;
      explanation?: string;
      explanations?: string[];
      modelAnswer?: string;
      /** mentor (default) | llm — learner BYOK instant grade for short answers. */
      autoGrade?: "mentor" | "llm";
      hints?: string[];
      hintAfterAttempts?: number;
      maxAttempts?: number;
      reviewChapters?: string[];
      rubric?: string;
      allowSpeechInput?: boolean;
      allowUrl?: boolean;
      urlLabel?: string;
      urlRequired?: boolean;
      urlHint?: string;
      minWords?: number;
    };
    try {
      parsed = loadYaml(yamlText) as typeof parsed;
    } catch {
      return match;
    }
    if (!parsed?.question) return match;

    if (parsed.type === "mcq" && parsed.options && typeof parsed.correct === "number") {
      const options = parsed.options.map((label, i) => ({ id: `opt-${i}`, label }));
      const id = ulid();
      const placeholder = pushBlock({
        id,
        type: "QUIZ",
        required: true,
        config: QuizConfigSchema.parse({
          quizType: "single",
          prompt: parsed.question,
          options,
          correctOptionIds: [`opt-${parsed.correct}`],
          explanation: quizExplanation(parsed.options, parsed.explanation, parsed.explanations),
          allowRetry: true,
        }),
      });
      return placeholder;
    }

    const id = ulid();
    const autoGrade = parsed.autoGrade === "llm" ? "llm" : "mentor";
    const hints = Array.isArray(parsed.hints)
      ? parsed.hints.map((hint) => String(hint).trim()).filter(Boolean)
      : undefined;
    return pushBlock({
      id,
      type: "OPEN_QUESTION",
      required: true,
      config: {
        prompt: parsed.question,
        minWords: parsed.minWords ?? 0,
        sampleAnswer: parsed.modelAnswer,
        rubric: parsed.rubric,
        autoGrade,
        ...(hints && hints.length > 0 ? { hints } : {}),
        ...(typeof parsed.hintAfterAttempts === "number"
          ? { hintAfterAttempts: parsed.hintAfterAttempts }
          : {}),
        ...(typeof parsed.maxAttempts === "number" ? { maxAttempts: parsed.maxAttempts } : {}),
        ...(Array.isArray(parsed.reviewChapters) ? { reviewChapterSlugs: parsed.reviewChapters } : {}),
        allowSpeechInput: parsed.allowSpeechInput ?? false,
        allowUrl: parsed.allowUrl ?? false,
        urlLabel: parsed.urlLabel,
        urlRequired: parsed.urlRequired ?? false,
        urlHint: parsed.urlHint,
      },
    });
  });
}

/** ```openquestion``` fenced YAML -> OpenQuestion with optional speech / URL fields. */
function transformOpenQuestionFences(body: string, pushBlock: (b: PendingBlock) => string): string {
  return body.replace(/```openquestion\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: {
      prompt: string;
      minWords?: number;
      required?: boolean;
      allowSpeechInput?: boolean;
      speechPrimary?: boolean;
      submissionMode?: "text" | "url" | "url_required" | "article" | "video_demo";
      allowUrl?: boolean;
      urlLabel?: string;
      urlRequired?: boolean;
      urlHint?: string;
      modelAnswer?: string;
      rubric?: string;
      autoGrade?: "mentor" | "llm";
      hints?: string[];
      hintAfterAttempts?: number;
      maxAttempts?: number;
      reviewChapters?: string[];
    };
    try {
      parsed = loadYaml(yamlText) as typeof parsed;
    } catch {
      return match;
    }
    if (!parsed?.prompt) return match;
    const id = ulid();
    return pushBlock({
      id,
      type: "OPEN_QUESTION",
      required: parsed.required ?? true,
      config: {
        prompt: parsed.prompt,
        minWords: parsed.minWords ?? 0,
        sampleAnswer: parsed.modelAnswer,
        rubric: parsed.rubric,
        autoGrade: parsed.autoGrade ?? "mentor",
        hints: parsed.hints,
        hintAfterAttempts: parsed.hintAfterAttempts,
        maxAttempts: parsed.maxAttempts,
        reviewChapterSlugs: parsed.reviewChapters,
        allowSpeechInput: parsed.allowSpeechInput ?? false,
        speechPrimary: parsed.speechPrimary ?? false,
        submissionMode: parsed.submissionMode ?? "text",
        allowUrl: parsed.allowUrl ?? false,
        urlLabel: parsed.urlLabel,
        urlRequired: parsed.urlRequired ?? false,
        urlHint: parsed.urlHint,
      },
    });
  });
}

export function parseLesson(moduleNum: number, moduleDir: string, fileName: string, lessonNum: number, slugPart: string): ParsedLesson {
  const raw = fs.readFileSync(path.join(COURSE_SOURCE_DIR, moduleDir, fileName), "utf8").replace(/\r\n/g, "\n");
  const { frontmatter, body } = parseFrontmatter(raw);

  const blocks: PendingBlock[] = [];
  const pushBlock = (block: PendingBlock) => {
    blocks.push(block);
    return blockPlaceholderTag(block);
  };

  let source = stripStepTypeBlockquote(body);
  source = stripLeadingH1(source);
  source = unwrapArticleBreak(source);
  if (isFocusChapter(fileName)) {
    source = stripFocusChapterEnrichment(source, isGateChecklistChapter(fileName));
  }
  if (isGateChecklistChapter(fileName)) {
    source = normalizeGateLearningLog(source);
  }
  source = normalizePlaceholderUrls(source);
  source = transformPresentationBlocks(source, pushBlock);
  source = transformVisualContentFences(source, pushBlock);
  source = transformQuizFences(source, pushBlock);
  source = transformOpenQuestionFences(source, pushBlock);
  source = transformPredictFences(source, pushBlock);
  source = transformAiInterviewFences(source, pushBlock);
  source = transformCodeExerciseFences(source, pushBlock);
  source = transformFaqSections(source);
  const isMilestone = /-checklist\.md$/.test(fileName);
  source = escapeMdxProse(source);

  const fallbackTitle = slugPart
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const stepType = String(frontmatter.stepType ?? "").toLowerCase();
  const estimatedRaw = frontmatter.estimatedMinutes;
  const estimatedMinutes =
    typeof estimatedRaw === "number"
      ? estimatedRaw
      : typeof estimatedRaw === "string"
        ? parseInt(estimatedRaw, 10)
        : null;
  const readerMode =
    stepType === "quiz" || /-quiz\.md$/.test(fileName) ? ("QUIZ" as const) : ("DEFAULT" as const);
  const passingRaw = Number(frontmatter.passingScore ?? 70);
  const quizPassingScore = Number.isInteger(passingRaw) && passingRaw >= 1 && passingRaw <= 100 ? passingRaw : 70;

  return {
    moduleNum,
    lessonNum,
    slugPart,
    title: cleanTitle(frontmatter.title as string | undefined, fallbackTitle),
    summary: (frontmatter.summary as string | undefined)?.trim() || null,
    estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : null,
    readerMode,
    quizPassingScore,
    source: source.trim() + "\n",
    blocks,
    isMilestone,
  };
}

async function upsertCourse(manifest: CourseManifest | null) {
  const mentor = await prisma.user.findFirst({ where: { role: "MENTOR" } });
  if (!mentor) {
    throw new Error(
      `No MENTOR user found — run "pnpm db:seed" first (creates ${SEED_USERS.find((u) => u.role === "MENTOR")?.email}).`
    );
  }

  const meta = manifest ?? SEED_COURSE;
  const existing = await prisma.course.findUnique({ where: { slug: meta.slug }, select: { activeReleaseId: true,
    enrollments: { where: { OR: [{ startedAt: { not: null } }, { chapterProgress: { some: {} } }] }, take: 1, select: { id: true } } } });
  if (existing?.activeReleaseId || existing?.enrollments.length) {
    throw new Error("This course has a release or active learner work. Use the reviewed course package publisher instead of content:import.");
  }
  const fields = {
    title: meta.title,
    description: meta.description,
    projectGoal: meta.projectGoal,
    difficulty: meta.difficulty,
    estimatedHours: meta.estimatedHours,
    category: courseCategoryFromSource(manifest?.category),
    coverUrl: meta.coverUrl ?? null,
    familySlug: meta.family ?? null,
    variantFamily: manifest?.variantFamily as unknown as Prisma.InputJsonValue | undefined,
    assistant: (manifest?.assistant ?? Prisma.DbNull) as Prisma.InputJsonValue,
  };

  return prisma.course.upsert({
    where: { slug: meta.slug },
    update: fields,
    create: {
      slug: meta.slug,
      ...fields,
      status: "PUBLISHED",
      mentorId: mentor.id,
      publishedAt: new Date(),
    },
  });
}

async function main() {
  const { findBrokenChapters } = await import("./validate-course-source.js");
  const { total, failed } = findBrokenChapters();
  if (failed.length > 0) {
    console.error(`Refusing to import — ${failed.length} of ${total} chapters do not compile:`);
    for (const failure of failed) console.error(`  ${failure.file}: ${failure.error}`);
    throw new Error("Course MDX validation failed");
  }
  console.log(`MDX ok: ${total} chapters`);

  const manifest = loadCourseManifest();
  const moduleTitles = new Map(manifest?.modules.map((m) => [m.dir, m.title]) ?? []);
  const course = await upsertCourse(manifest);

  let moduleCount = 0;
  let chapterCount = 0;
  let blockCount = 0;

  const moduleDirs = readModuleDirs();
  const importedModuleOrders: number[] = [];
  const importedChapterSlugs: string[] = [];

  for (let index = 0; index < moduleDirs.length; index++) {
    const { dirName, moduleNum } = moduleDirs[index]!;
    const displayOrder = index + 1;
    importedModuleOrders.push(displayOrder);

    const plannedModule = manifest?.modules.find(m => m.dir === dirName);
    const title = moduleTitles.get(dirName) ?? CHAPTER_NAMES[moduleNum] ?? `Module ${displayOrder}`;
    const mod = await prisma.module.upsert({
      where: { courseId_order: { courseId: course.id, order: displayOrder } },
      update: { title, contentKey: plannedModule?.key, archivedAt: null },
      create: { courseId: course.id, order: displayOrder, title, contentKey: plannedModule?.key },
    });
    moduleCount += 1;

    for (const { fileName, lessonNum, slugPart } of readLessonFiles(dirName)) {
      const contentKey = plannedModule?.lessons.find(l => l.file === fileName)?.key;
      const lesson = parseLesson(moduleNum, dirName, fileName, lessonNum, slugPart);
      const slug = `${displayOrder}-${lessonNum}-${slugPart}`;
      importedChapterSlugs.push(slug);

      const priorChapter = await prisma.chapter.findUnique({
        where: { courseId_slug: { courseId: course.id, slug } },
        select: { id: true },
      });
      const unmatchedBlocks = priorChapter ? await reconcileBlockIds(priorChapter.id, lesson) : [];

      const chapter = await prisma.chapter.upsert({
        where: { courseId_slug: { courseId: course.id, slug } },
        update: {
          contentKey,
          archivedAt: null,
          moduleId: mod.id,
          title: lesson.title,
          summary: lesson.summary,
          order: lessonNum,
          estimatedMinutes: lesson.estimatedMinutes,
          readerMode: lesson.readerMode,
          quizPassingScore: lesson.quizPassingScore,
          source: lesson.source,
          compiled: lesson.source,
          isMilestone: lesson.isMilestone,
          publishedAt: new Date(),
        },
        create: {
          courseId: course.id,
          contentKey,
          moduleId: mod.id,
          slug,
          title: lesson.title,
          summary: lesson.summary,
          order: lessonNum,
          estimatedMinutes: lesson.estimatedMinutes,
          readerMode: lesson.readerMode,
          quizPassingScore: lesson.quizPassingScore,
          source: lesson.source,
          compiled: lesson.source,
          isMilestone: lesson.isMilestone,
          publishedAt: new Date(),
        },
      });
      chapterCount += 1;

      for (const [index, block] of lesson.blocks.entries()) {
        await prisma.block.upsert({
          where: { id: block.id },
          update: { order: index + 1, required: block.required, config: block.config, archivedAt: null },
          create: {
            id: block.id,
            chapterId: chapter.id,
            type: block.type,
            order: index + 1,
            required: block.required,
            blocking: false,
            points: 1,
            config: block.config,
            tags: [],
          },
        });
      }
      for (const old of unmatchedBlocks) {
        if (old._count.responses > 0) {
          await prisma.block.update({ where: { id: old.id }, data: { archivedAt: new Date() } });
        } else {
          await prisma.block.delete({ where: { id: old.id } });
        }
      }
      blockCount += lesson.blocks.length;

    }
  }

  // A source omission must not cascade-delete learner responses, notes or study history.
  const archivedAt = new Date();
  await prisma.chapter.updateMany({
    where: { courseId: course.id, slug: { notIn: importedChapterSlugs }, archivedAt: null },
    data: { archivedAt },
  });
  await prisma.module.updateMany({
    where: { courseId: course.id, order: { notIn: importedModuleOrders }, archivedAt: null },
    data: { archivedAt },
  });
  const enrollments = await prisma.enrollment.findMany({ where: { courseId: course.id }, select: { id: true } });
  for (const enrollment of enrollments) {
    await prisma.$transaction(tx => recomputeEnrollmentRollup(tx, enrollment.id, { preserveActivity: true }));
  }

  console.log(`Course:   ${course.title} (${course.slug})`);
  console.log(`Modules:  ${moduleCount}`);
  console.log(`Chapters: ${chapterCount}`);
  console.log(`Blocks:   ${blockCount}`);
}

const invokedDirectly =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
