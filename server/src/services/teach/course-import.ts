import type { Prisma } from "../../generated/prisma/index.js";
import { unzipSync } from "fflate";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load as loadYaml } from "js-yaml";
import { ulid } from "ulid";
import { prisma } from "../../db/prisma.js";
import { BadRequestError, ConflictError, TooManyRequestsError, UnprocessableError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { courseCategoryFromSource, type CourseCategorySource } from "../../shared/domain/enums.js";
import type { CourseFamily } from "../../shared/lib/course-tracks.js";
import type { CourseAssistant } from "../ai/chapter-qa/assistant.js";
import { publishCourseRelease } from "./publish-course-release.js";
import type { UpdateMapping } from "./course-update-matching.js";

const execute = promisify(execFile);
// Only the backend release command may use the larger family package limit.
// Dashboard ZIPs retain the existing HTTP and expansion bounds.
export type CourseZipSource = "dashboard" | "repository";
const ZIP_LIMITS = {
  dashboard: { files: 1000, expanded: 20 * 1024 * 1024 },
  repository: { files: 3000, expanded: 40 * 1024 * 1024 },
} as const;

/** Validate before extracting; never trust paths or declared expansion sizes in an upload. */
export function readCourseZip(buffer: Buffer, source: CourseZipSource = "dashboard"): Record<string, Uint8Array> {
  const limit = ZIP_LIMITS[source];
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, { filter: entry => {
      if (++count > limit.files || (total += entry.originalSize) > limit.expanded) throw new Error(`ZIP exceeds ${limit.files.toLocaleString()} entries or ${limit.expanded / 1024 / 1024} MB expanded.`);
      if (entry.name.includes("\\") || entry.name.startsWith("/") || entry.name.split("/").some(p => p === ".." || p.includes(":"))) {
        throw new Error("ZIP contains an unsafe path.");
      }
      return !entry.name.endsWith("/");
    }});
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "Invalid ZIP archive.");
  }
  const manifests = Object.keys(files).filter(name => /(^|\/)course\.yaml$/.test(name));
  if (manifests.length !== 1) throw new BadRequestError("ZIP must contain exactly one course.yaml at its root or inside one course folder.");
  const prefix = manifests[0].slice(0, -"course.yaml".length);
  if (prefix.split("/").filter(Boolean).length > 1) throw new BadRequestError("Place the course at the ZIP root or inside one folder.");
  const result: Record<string, Uint8Array> = {};
  total = 0;
  for (const [name, bytes] of Object.entries(files)) {
    if ((total += bytes.length) > limit.expanded) throw new BadRequestError(`ZIP expands beyond ${limit.expanded / 1024 / 1024} MB.`);
    if (!name.startsWith(prefix)) throw new BadRequestError("All files must be inside the course folder.");
    const relative = name.slice(prefix.length);
    if (!/^(course\.yaml|COURSE-OUTLINE\.md|(?:variants\/[a-z0-9-]+\/)?\d+-[a-z0-9-]+\/\d+\.\d+-[a-z0-9-]+\.md)$/.test(relative)) {
      throw new BadRequestError(`Unsupported course file: ${relative}`);
    }
    result[relative] = bytes;
  }
  return result;
}

export type ImportPlan = {
  manifest: {
    title: string; description: string; projectGoal: string; difficulty: string;
    estimatedHours: number; coverUrl?: string; family?: string; category?: CourseCategorySource;
    variantFamily?: CourseFamily;
    assistant?: CourseAssistant;
    availableVariantSlugs?: string[];
    publication?: "create" | "update"; creatorEmail?: string;
  };
  modules: { key?: string; order?: number; title: string; lessons: {
    key?: string; lessonNum: number; slugPart: string; title: string; summary: string | null;
    source: string; estimatedMinutes: number | null; readerMode: "DEFAULT" | "QUIZ";
    quizPassingScore?: number;
    isMilestone: boolean;
    blocks: { id: string; type: Prisma.BlockCreateManyInput["type"]; config: Prisma.InputJsonValue; required: boolean }[];
  }[] }[];
  variants?: { slug: string; overrides: { lessonKey: string; lesson: ImportPlan["modules"][number]["lessons"][number] }[];
    modules?: ImportPlan["modules"]; omitLessonKeys?: string[]; moduleOrder?: string[] }[];
  remove?: { moduleKeys: string[]; lessonKeys: string[] };
};

let importing = false;
let parsing = false;

export async function importCourseZip(user: SessionUser, buffer: Buffer, source: CourseZipSource = "dashboard") {
  if (importing) throw new TooManyRequestsError("A course import is running. Please try again shortly.");
  importing = true;
  try { return await runCourseImport(user, buffer, source); }
  finally { importing = false; }
}

export async function parseCourseZip(buffer: Buffer, source: CourseZipSource = "dashboard") {
  if (parsing) throw new TooManyRequestsError("A course ZIP is being validated. Please try again shortly.");
  parsing = true;
  try { return await parseCourseZipFiles(buffer, source); }
  finally { parsing = false; }
}

async function parseCourseZipFiles(buffer: Buffer, source: CourseZipSource) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new BadRequestError("Upload a ZIP file.");
  const files = readCourseZip(buffer, source);
  let slug: string;
  try {
    const meta = loadYaml(Buffer.from(files["course.yaml"]).toString("utf8")) as { slug?: unknown };
    if (!meta || typeof meta.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug)) throw new Error();
    slug = meta.slug;
  } catch { throw new BadRequestError("course.yaml needs a kebab-case slug."); }
  const temporary = await mkdtemp(path.join(tmpdir(), "buildment-course-"));
  try {
    const source = path.join(temporary, "source");
    await mkdir(source);
    for (const [name, bytes] of Object.entries(files)) {
      const target = path.join(source, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    const result = path.join(temporary, "result.json");
    const worker = fileURLToPath(new URL("../../../scripts/zip-import/worker.ts", import.meta.url));
    try {
      await execute(process.execPath, ["--import", "tsx", worker, "--course", slug, "--strict"], {
        env: { ...process.env, COURSE_IMPORT_SOURCE: source, COURSE_IMPORT_RESULT: result },
        timeout: source === "repository" ? 300000 : 120000, maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      const reasons = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`.trim();
      throw new UnprocessableError("Course validation failed.", "COURSE_IMPORT_INVALID", [reasons || "Validation timed out or could not complete."]);
    }
    const plan = JSON.parse(await readFile(result, "utf8")) as ImportPlan;
    return { slug, plan };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function runCourseImport(user: SessionUser, buffer: Buffer, source: CourseZipSource) {
  const { slug, plan } = await parseCourseZip(buffer, source);
  if (plan.manifest.publication === "update") throw new BadRequestError("This package declares an update. Open the existing course and use Update from ZIP.");
  if (!plan.modules.length) throw new BadRequestError("A new course needs at least one module.");
  const { title, description, projectGoal, difficulty, estimatedHours, coverUrl, family, variantFamily } = plan.manifest;
  const category = courseCategoryFromSource(plan.manifest.category);
  const metadata = { title, description, projectGoal, difficulty, estimatedHours, coverUrl, category,
    familySlug: family ?? null, variantFamily: variantFamily as unknown as Prisma.InputJsonValue | undefined,
    assistant: plan.manifest.assistant as Prisma.InputJsonValue | undefined,
    availableVariantSlugs: plan.manifest.availableVariantSlugs ?? [] };
  try {
    const course = await prisma.$transaction(async tx => {
      const created = await tx.course.create({ data: { ...metadata, slug, mentorId: user.id, status: "DRAFT" } });
      const modules: Prisma.ModuleCreateManyInput[] = [];
      const chapters: Prisma.ChapterCreateManyInput[] = [];
      const blocks: Prisma.BlockCreateManyInput[] = [];
      const mapping: UpdateMapping = [];
      for (const [index, module] of plan.modules.entries()) {
        const moduleId = ulid();
        const mapped: UpdateMapping[number] = { moduleId, chapters: [] };
        mapping.push(mapped);
        modules.push({ id: moduleId, courseId: created.id, contentKey: module.key, title: module.title, order: index + 1 });
        for (const lesson of module.lessons) {
          const chapterId = ulid();
          mapped.chapters.push({ chapterId, similarity: 1, reason: "Initial import" });
          chapters.push({
            id: chapterId, courseId: created.id, moduleId,
            contentKey: lesson.key,
            slug: `${index + 1}-${lesson.lessonNum}-${lesson.slugPart}`,
            title: lesson.title, summary: lesson.summary, source: lesson.source, compiled: lesson.source,
            order: lesson.lessonNum, estimatedMinutes: lesson.estimatedMinutes, readerMode: lesson.readerMode,
            quizPassingScore: lesson.quizPassingScore ?? 70,
            isMilestone: lesson.isMilestone,
          });
          blocks.push(...lesson.blocks.map((block, i) => ({
            ...block, chapterId, order: i + 1, blocking: false, points: 1, tags: [],
          })));
        }
      }
      await tx.module.createMany({ data: modules });
      await tx.chapter.createMany({ data: chapters });
      if (blocks.length) await tx.block.createMany({ data: blocks });
      if (plan.variants?.length) await publishCourseRelease(tx, created.id, plan, mapping);
      return created;
    }, { timeout: source === "repository" ? 300000 : 120000, maxWait: 10000 });
    return { courseSlug: course.slug };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ConflictError("A course with this slug already exists. Use Update from ZIP in its course settings, or change the slug to create a separate course.");
    throw error;
  }
}
