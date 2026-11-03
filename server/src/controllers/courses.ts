import type { Request, Response } from "express";
import { ok } from "../utils/responses.js";
import { continueChapterPath } from "../services/courses/continue.js";
import { getCourseOverview, upgradeEnrollmentCurriculum } from "../services/courses/overview.js";
import { loadChapterReader } from "../services/chapters/reader.js";
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
