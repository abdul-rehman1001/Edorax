import type { Request, Response } from "express";
import { ok } from "../utils/responses.js";
import { continueChapterPath } from "../services/courses/continue.js";
import { getCourseOverview, upgradeEnrollmentCurriculum } from "../services/courses/overview.js";
import { loadChapterReader } from "../services/chapters/reader.js";
import { prisma } from "../db/prisma.js";
import { loadBlockState } from "../services/blocks/state.js";
import { BadRequestError } from "../utils/errors.js";
import { chooseCourseSpecialisation, chooseCourseVariant } from "../services/courses/track.js";

// GET /api/v1/courses/:courseSlug/continue
export async function continueChapter(req: Request, res: Response) {
  const result = await continueChapterPath({ courseSlug: req.params.courseSlug as string, user: req.user });
  ok(res, result);
}

// GET /api/v1/courses/:courseSlug/overview
export async function overview(req: Request, res: Response) {
  ok(res, await getCourseOverview(req.params.courseSlug as string, req.user!));
}

// GET /api/v1/courses/:courseSlug/chapters/:chapterSlug
export async function chapter(req: Request, res: Response) {
  const { courseSlug, chapterSlug } = req.params as { courseSlug: string; chapterSlug: string };
  ok(res, await loadChapterReader(courseSlug, chapterSlug, req.user!));
}

// GET /api/v1/courses/:courseSlug/chapters/:chapterSlug/download
// Read-only content for a learner's offline package. Block states are sanitized
// by the same service used by the online reader; stored answer keys never leave.
export async function downloadChapter(req: Request, res: Response) {
  const { courseSlug, chapterSlug } = req.params as { courseSlug: string; chapterSlug: string };
  const lesson = await loadChapterReader(courseSlug, chapterSlug, req.user!, 0, true);
  const enrollment = await prisma.enrollment.findUniqueOrThrow({
    where: { courseId_userId: { courseId: lesson.course.id, userId: req.user!.id } },
    select: { releaseId: true },
  });
  const activeRelease = await prisma.course.findUniqueOrThrow({ where: { id: lesson.course.id }, select: { activeReleaseId: true } });
  const releaseId = enrollment.releaseId ?? activeRelease.activeReleaseId ?? lesson.course.id;
  if (!releaseId) throw new BadRequestError("This course does not have a downloadable release yet.");
  if (lesson.locked || !lesson.content) {
    ok(res, { releaseId, lesson, blocks: {} });
    return;
  }
  const blocks = await prisma.block.findMany({ where: { chapterId: lesson.chapter.id, archivedAt: null }, select: { id: true } });
  const states: Record<string, unknown> = {};
  await Promise.all(
    blocks.map(async ({ id }) => {
      try {
        states[id] = await loadBlockState(id, req.user);
      } catch {
        // Skip blocks whose state cannot be computed
      }
    })
  );
  ok(res, { releaseId, lesson, blocks: states });
}

// PUT /api/v1/courses/:courseSlug/track/variant
export async function chooseVariant(req: Request, res: Response) {
  const { variantSlug } = req.body as { variantSlug: string };
  ok(res, await chooseCourseVariant(req.params.courseSlug as string, req.user!, variantSlug));
}

// PUT /api/v1/courses/:courseSlug/track/specialisation
export async function chooseSpecialisation(req: Request, res: Response) {
  const { specialisationSlug } = req.body as { specialisationSlug: string };
  ok(res, await chooseCourseSpecialisation(req.params.courseSlug as string, req.user!, specialisationSlug));
}

// POST /api/v1/courses/:courseSlug/upgrade-curriculum
export async function upgradeCurriculum(req: Request, res: Response) {
  ok(res, await upgradeEnrollmentCurriculum(req.params.courseSlug as string, req.user!));
}
