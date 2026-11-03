import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";
import { ensureBaselineRelease } from "../../src/services/courses/releases.js";
import { getCourseOverview } from "../../src/services/courses/overview.js";
import { publishDashboardNewChapterRelease } from "../../src/services/teach/publish-course-release.js";

const app = createApp();

describe("course release auto-upgrade and alumni notification", () => {
  let fx: Awaited<ReturnType<typeof createCourseFixture>>;
  let baselineReleaseId: string;

  beforeAll(async () => {
    fx = await createCourseFixture();
    const baseline = await prisma.$transaction((tx) => ensureBaselineRelease(tx, fx.course.id));
    baselineReleaseId = baseline.id;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("automatically upgrades in-progress learners on overview open", async () => {
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // 2. Add and publish a new chapter to create release #2
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
    const newChapter = await prisma.chapter.create({
      data: {
        id: `ch-v2-${Date.now()}`,
        courseId: fx.course.id,
        moduleId: moduleRow.id,
        slug: `new-chapter-${Date.now()}`,
        title: "Brand New Chapter in V2",
        order: 99,
        publishedAt: new Date(),
        readerMode: "DEFAULT",
        source: "# Brand New Chapter",
      },
    });

    await prisma.$transaction((tx) =>
      publishDashboardNewChapterRelease(tx, fx.course.id, newChapter.id)
    );

    const updatedCourse = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    expect(updatedCourse.activeReleaseId).not.toBe(baselineReleaseId);

    // 3. Intentionally pin enrollment back to old baseline release to test lazy upgrade
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // 4. Fetch overview as the learner
    const overview = await getCourseOverview(fx.course.slug, fx.learner);

    // 5. Verify learner was automatically shifted to active release and sees all chapters
    expect(overview.curriculumUpgradeAvailable).toBe(false);
    expect(overview.syllabus?.chapterCount).toBeGreaterThanOrEqual(3);

    const refreshedEnrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: fx.enrollment.id },
    });
    expect(refreshedEnrollment.releaseId).toBe(updatedCourse.activeReleaseId);
  });

  it("protects completed learners from auto-downgrade and shows upgrade banner", async () => {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });

    // Completed learner is pinned to older baseline
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "COMPLETED", percentComplete: 100 },
    });

    // Ensure course activeReleaseId is newer
    expect(course.activeReleaseId).not.toBe(baselineReleaseId);

    // Fetch overview as completed learner
    const overview = await getCourseOverview(fx.course.slug, fx.learner);

    // Completed status is protected; curriculumUpgradeAvailable flag is true
    expect(overview.curriculumUpgradeAvailable).toBe(true);
    const enrollmentInDb = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(enrollmentInDb.releaseId).toBe(baselineReleaseId);
    expect(enrollmentInDb.status).toBe("COMPLETED");
  });

  it("allows completed learners to explicitly upgrade curriculum via API", async () => {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });

    const res = await request(app)
      .post(`/api/v1/courses/${fx.course.slug}/upgrade-curriculum`)
      .set({ Authorization: `Bearer ${fx.learnerToken}` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBe(course.activeReleaseId);

    const enrollmentInDb = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(enrollmentInDb.releaseId).toBe(course.activeReleaseId);

    // Overview should now show upgrade is no longer needed
    const overview = await getCourseOverview(fx.course.slug, fx.learner);
    expect(overview.curriculumUpgradeAvailable).toBe(false);
  });

  it("notifies completed learners when a new release is published", async () => {
    // 1. Mark learner as COMPLETED on current release
    const currentCourse = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: currentCourse.activeReleaseId, status: "COMPLETED", percentComplete: 100 },
    });

    // 2. Publish another chapter
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
    const alumniChapter = await prisma.chapter.create({
      data: {
        id: `ch-alumni-${Date.now()}`,
        courseId: fx.course.id,
        moduleId: moduleRow.id,
        slug: `alumni-chapter-${Date.now()}`,
        title: "Alumni Update Chapter",
        order: 101,
        publishedAt: new Date(),
        readerMode: "DEFAULT",
        source: "# Alumni Chapter",
      },
    });

    await prisma.$transaction((tx) =>
      publishDashboardNewChapterRelease(tx, fx.course.id, alumniChapter.id)
    );

    // 3. Verify notification was created for the completed learner
    const notification = await prisma.notification.findFirst({
      where: {
        userId: fx.learner.id,
        type: "course.curriculum_updated",
        courseId: fx.course.id,
      },
    });

    expect(notification).not.toBeNull();
    expect(notification?.title).toBe("New Chapters Available!");
  });
});
