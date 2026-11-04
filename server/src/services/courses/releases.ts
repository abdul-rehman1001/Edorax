import { ulid } from "ulid";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { resolveCourseFamily, type CourseFamily } from "../../shared/lib/course-tracks.js";
import { NotFoundError } from "../../utils/errors.js";

export type ReleaseChapter = {
  id: string; key: string | null; slug: string; title: string; order: number;
  estimatedMinutes: number | null; readerMode: "DEFAULT" | "QUIZ"; isMilestone: boolean;
  quizPassingScore: number;
};
export type ReleaseModule = { id: string; key: string | null; title: string; order: number; chapters: ReleaseChapter[] };
export type ReleaseContent = { variants: Record<string, ReleaseModule[]> };

export function variantForRelease(familySlug: string | CourseFamily | null, variantSlug: string | null): string {
  return variantSlug ?? (typeof familySlug === "object" && familySlug ? familySlug : resolveCourseFamily(familySlug))?.defaultVariantSlug ?? "default";
}

export async function snapshotLiveCourse(tx: Prisma.TransactionClient, courseId: string, familySlug: string | null): Promise<ReleaseContent> {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { status: true, variantFamily: true } });
  const modules = await tx.module.findMany({
    where: { courseId, archivedAt: null }, orderBy: { order: "asc" },
    include: { chapters: { where: { archivedAt: null, ...(course.status === "DRAFT" ? {} : { publishedAt: { not: null } }) }, orderBy: { order: "asc" } } },
  });
  const contentModules: ReleaseModule[] = modules.map(module => ({
    id: module.id, key: module.contentKey, title: module.title, order: module.order,
    chapters: module.chapters.map(chapter => ({ id: chapter.id, key: chapter.contentKey, slug: chapter.slug,
      title: chapter.title, order: chapter.order, estimatedMinutes: chapter.estimatedMinutes,
      readerMode: chapter.readerMode, quizPassingScore: chapter.quizPassingScore, isMilestone: chapter.isMilestone })),
  }));
  const variants = resolveCourseFamily(familySlug, course.variantFamily)?.variants.map(variant => variant.slug) ?? ["default"];
  return { variants: Object.fromEntries(variants.map(slug => [slug, contentModules])) };
}

/** Called inside a publish transaction, before any live-row edits. */
export async function ensureBaselineRelease(tx: Prisma.TransactionClient, courseId: string) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
  if (course.activeReleaseId) return tx.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const content = await snapshotLiveCourse(tx, courseId, course.familySlug);
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: 1, content: content as unknown as Prisma.InputJsonValue } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  // Existing learners who have begun work keep this baseline after publication.
  await tx.enrollment.updateMany({ where: { courseId, releaseId: null,
    OR: [{ startedAt: { not: null } }, { variantLockedAt: { not: null } }, { chapterProgress: { some: {} } }] },
    data: { releaseId: release.id } });
  const family = resolveCourseFamily(course.familySlug, course.variantFamily);
  if (family) {
    const begun = { OR: [{ startedAt: { not: null } }, { chapterProgress: { some: {} } }] };
    await tx.enrollment.updateMany({ where: { courseId, variantSlug: null, ...begun },
      data: { variantSlug: family.defaultVariantSlug, variantChosenAt: new Date() } });
    await tx.enrollment.updateMany({ where: { courseId, variantLockedAt: null, ...begun },
      data: { variantLockedAt: new Date() } });
  }
  return release;
}

export async function releaseForEnrollment(courseId: string, enrollment: { releaseId: string | null; variantSlug: string | null }, familySlug: string | null) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, variantFamily: true } });
  const releaseId = enrollment.releaseId ?? course.activeReleaseId;
  if (!releaseId) return null;
  const release = await prisma.courseRelease.findFirst({ where: { id: releaseId, courseId } });
  if (!release) throw new NotFoundError("Course release not found.");
  const content = release.content as unknown as ReleaseContent;
  const variant = variantForRelease(resolveCourseFamily(familySlug, course.variantFamily), enrollment.variantSlug);
  const modules = content.variants[variant];
  if (!modules) throw new NotFoundError("Course variant not found in this release.");
  return { release, variant, modules };
}

/** Build the existing syllabus shape from a pinned release. Chapter and block rows are immutable once referenced. */
export async function releaseModulesWithBlocks(modules: ReleaseModule[]) {
  const ids = modules.flatMap(module => module.chapters.map(chapter => chapter.id));
  const rows = await prisma.chapter.findMany({ where: { id: { in: ids } }, select: {
    id: true, blocks: { where: { archivedAt: null }, select: { id: true, type: true, required: true, archivedAt: true } },
  } });
  const byId = new Map(rows.map(row => [row.id, row.blocks]));
  return modules.map(module => ({ ...module, chapters: module.chapters.map(chapter => ({ ...chapter, blocks: byId.get(chapter.id) ?? [] })) }));
}

export async function releaseContainsChapter(courseId: string, enrollment: { releaseId: string | null; variantSlug: string | null }, familySlug: string | null, chapterId: string) {
  const selected = await releaseForEnrollment(courseId, enrollment, familySlug);
  return !selected || selected.modules.some(module => module.chapters.some(chapter => chapter.id === chapterId));
}

export async function assertEnrollmentChapter(tx: Prisma.TransactionClient, enrollmentId: string, chapterId: string) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId },
    select: { courseId: true, releaseId: true, variantSlug: true, course: { select: { activeReleaseId: true, familySlug: true, variantFamily: true } } } });
  const id = enrollment.releaseId ?? enrollment.course.activeReleaseId;
  if (!id) return;
  const release = await tx.courseRelease.findFirstOrThrow({ where: { id, courseId: enrollment.courseId } });
  const variant = variantForRelease(resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily), enrollment.variantSlug);
  const content = release.content as unknown as ReleaseContent;
  const modules = content.variants[variant];
  if (!modules) throw new NotFoundError("Course variant not found in this release.");
  if (!modules.some(module => module.chapters.some(chapter => chapter.id === chapterId))) throw new NotFoundError("Chapter is not in this learner's course release.");
}

export function cleanChapterSlug(slug: string): string {
  return slug.replace(/--[a-z0-9]+$/i, "").trim().toLowerCase();
}

/**
 * Forward-migrates an enrollment's progress and submitted responses from their current release
 * into a target release, preserving completed chapters, scores, learning logs, and question answers.
 */
export async function upgradeEnrollmentToRelease(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  targetReleaseId: string
) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      course: { select: { id: true, slug: true, familySlug: true, variantFamily: true, activeReleaseId: true } },
      chapterProgress: { include: { chapter: true } },
    },
  });

  if (enrollment.releaseId === targetReleaseId) {
    return;
  }

  const targetRelease = await tx.courseRelease.findUniqueOrThrow({
    where: { id: targetReleaseId },
  });

  const content = targetRelease.content as unknown as ReleaseContent;
  const variant = variantForRelease(
    resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily),
    enrollment.variantSlug
  );
  const modules = content?.variants?.[variant] ?? content?.variants?.default ?? [];
  const targetChapters: ReleaseChapter[] = modules.flatMap((m) => m.chapters);

  const targetById = new Map(targetChapters.map((c) => [c.id, c]));
  const targetBySlug = new Map(targetChapters.map((c) => [cleanChapterSlug(c.slug), c]));
  const targetByKey = new Map(targetChapters.filter((c) => c.key).map((c) => [c.key!, c]));

  // 1. Forward-migrate ChapterProgress rows
  for (const cp of enrollment.chapterProgress) {
    if (targetById.has(cp.chapterId)) continue;

    const oldKey = cp.chapter.contentKey;
    const oldSlug = cleanChapterSlug(cp.chapter.slug);
    const targetChapter = (oldKey ? targetByKey.get(oldKey) : null) ?? targetBySlug.get(oldSlug);

    if (!targetChapter) continue;

    const existingTarget = await tx.chapterProgress.findUnique({
      where: { enrollmentId_chapterId: { enrollmentId, chapterId: targetChapter.id } },
    });

    if (existingTarget) {
      const isCompleted = cp.status === "COMPLETED" || existingTarget.status === "COMPLETED";
      const newStatus = isCompleted
        ? "COMPLETED"
        : cp.status === "IN_PROGRESS" || existingTarget.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED";

      await tx.chapterProgress.update({
        where: { id: existingTarget.id },
        data: {
          status: newStatus,
          blocksCompleted: Math.max(cp.blocksCompleted, existingTarget.blocksCompleted),
          blocksTotal: Math.max(cp.blocksTotal, existingTarget.blocksTotal),
          score: Math.max(cp.score, existingTarget.score),
          maxScore: Math.max(cp.maxScore, existingTarget.maxScore),
          completedAt: existingTarget.completedAt ?? cp.completedAt,
          learningLog: existingTarget.learningLog ?? cp.learningLog ?? undefined,
        },
      });
    } else {
      await tx.chapterProgress.create({
        data: {
          enrollmentId,
          chapterId: targetChapter.id,
          status: cp.status,
          blocksCompleted: cp.blocksCompleted,
          blocksTotal: cp.blocksTotal,
          score: cp.score,
          maxScore: cp.maxScore,
          startedAt: cp.startedAt,
          completedAt: cp.completedAt,
          learningLog: cp.learningLog ?? undefined,
        },
      });
    }
  }

  // 2. Forward-remap Response (answers) rows
  const responses = await tx.response.findMany({
    where: { enrollmentId },
    include: { block: { include: { chapter: true } } },
    orderBy: { submittedAt: "asc" },
  });

  const chapterCache = new Map<string, any>();
  const getChapterWithBlocks = async (chapterId: string) => {
    if (chapterCache.has(chapterId)) return chapterCache.get(chapterId);
    const ch = await tx.chapter.findUnique({
      where: { id: chapterId },
      include: { blocks: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
    });
    chapterCache.set(chapterId, ch);
    return ch;
  };

  for (const resp of responses) {
    if (targetById.has(resp.block.chapterId)) continue;

    const oldChapter = resp.block.chapter;
    const oldSlug = cleanChapterSlug(oldChapter.slug);
    const targetChapterMeta = (oldChapter.contentKey ? targetByKey.get(oldChapter.contentKey) : null) ?? targetBySlug.get(oldSlug);

    if (!targetChapterMeta) continue;

    const [oldChapterWithBlocks, targetChapterWithBlocks] = await Promise.all([
      getChapterWithBlocks(oldChapter.id),
      getChapterWithBlocks(targetChapterMeta.id),
    ]);

    if (!oldChapterWithBlocks || !targetChapterWithBlocks) continue;

    const oldBlockIndex = oldChapterWithBlocks.blocks.findIndex((b: any) => b.id === resp.blockId);
    const oldBlock = oldChapterWithBlocks.blocks[oldBlockIndex];

    const targetBlock =
      targetChapterWithBlocks.blocks.find((b: any) => b.id === resp.blockId) ??
      targetChapterWithBlocks.blocks.find((b: any) => b.type === oldBlock?.type && b.order === oldBlock?.order) ??
      targetChapterWithBlocks.blocks.filter((b: any) => b.type === oldBlock?.type)[0] ??
      targetChapterWithBlocks.blocks[oldBlockIndex];

    if (!targetBlock) continue;

    const existingTargetResp = await tx.response.findFirst({
      where: {
        blockId: targetBlock.id,
        userId: resp.userId,
        attempt: resp.attempt,
      },
    });

    if (!existingTargetResp) {
      await tx.response.update({
        where: { id: resp.id },
        data: { blockId: targetBlock.id },
      });
    }
  }

  // 3. Update releaseId and recalculate rollup metrics
  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: { releaseId: targetReleaseId },
  });

  const { recomputeEnrollmentRollup } = await import("../progress/compute.js");
  await recomputeEnrollmentRollup(tx, enrollmentId, { preserveActivity: true });
}
