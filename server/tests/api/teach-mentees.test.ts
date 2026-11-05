import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { completeChapter, createCourseFixture } from "../helpers/fixtures.js";

// Mentor view of a cohort: roster, evaluation, assignment by email, invite
// links, nudges and the progress repair.

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let mentorToken = "";
const createdUserIds: string[] = [];

beforeAll(async () => {
  fx = await createCourseFixture();
  mentorToken = (await createSession(fx.mentor.id)).sessionToken;
});

afterAll(async () => {
  await prisma.invite.deleteMany({ where: { courseId: fx.course.id } });
  await prisma.enrollment.deleteMany({ where: { courseId: fx.course.id, userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await fx.cleanup();
});

const mentor = () => ({ Authorization: `Bearer ${mentorToken}` });
const learner = () => ({ Authorization: `Bearer ${fx.learnerToken}` });

describe("GET /api/v1/teach/courses/:courseSlug/mentees", () => {
  it("lists enrolled learners with progress and attention flags", async () => {
    await completeChapter(fx.enrollment.id, fx.chapterA.id);
    const res = await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees`).set(mentor());
    expect(res.status).toBe(200);
    expect(res.body.data.course).toMatchObject({ id: fx.course.id, status: "PUBLISHED", chapterCount: 2 });
    expect(res.body.data.mentees).toHaveLength(1);
    expect(res.body.data.mentees[0]).toMatchObject({
      id: fx.enrollment.id,
      userId: fx.learner.id,
      chapterCount: 2,
      evaluationHref: `/courses/${fx.course.slug}/mentees/${fx.enrollment.id}`,
    });
    expect(res.body.data.summary.total).toBe(1);
    expect(res.body.data.linkInvite).toBeNull();
    expect((await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees`).set(learner())).status).toBe(403);
  });

  it("serves the evaluation page model and scopes enrollments to the course", async () => {
    const res = await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees/${fx.enrollment.id}`).set(mentor());
    expect(res.status).toBe(200);
    expect(res.body.data.mentee.id).toBe(fx.learner.id);
    expect(res.body.data.enrollment).toMatchObject({ id: fx.enrollment.id, chapterCount: 2 });
    expect(res.body.data.modules).toHaveLength(1);
    expect(res.body.data.modules[0].chapters.map((c: { slug: string; locked: boolean }) => [c.slug, c.locked])).toEqual([
      ["chapter-a", false],
      ["chapter-b", false],
    ]);
    expect(res.body.data.modules[0].chapters[0].status).toBe("COMPLETED");
    expect(res.body.data.submissions).toEqual([]);

    const missing = await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees/nope`).set(mentor());
    expect(missing.status).toBe(404);
  });
});

describe("invites", () => {
  it("enrols existing accounts and invites unknown addresses", async () => {
    const existing = await prisma.user.create({
      data: { email: `assignee-${fx.course.id}@test.local`, name: "Assignee", role: "MENTEE", emailVerified: new Date() },
    });
    createdUserIds.push(existing.id);

    const res = await request(app)
      .post(`/api/v1/teach/courses/${fx.course.id}/invites/assign`)
      .set(mentor())
      .send({ emails: `${existing.email}, Newcomer-${fx.course.id}@Test.local\nnot-an-email` });
    expect(res.status).toBe(200);
    expect(res.body.data.enrolledEmails).toEqual([existing.email]);
    expect(res.body.data.invitedEmails).toEqual([`newcomer-${fx.course.id}@test.local`]);
    expect(res.body.data.emailFailed).toBe(true); // no email delivery in tests

    const enrollment = await prisma.enrollment.findUnique({ where: { courseId_userId: { courseId: fx.course.id, userId: existing.id } } });
    expect(enrollment).toMatchObject({ status: "ASSIGNED", assignedById: fx.mentor.id, lifecycle: "ACTIVE" });

    // Re-sending reuses the pending invite instead of creating a second one.
    await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/assign`).set(mentor()).send({ emails: `newcomer-${fx.course.id}@test.local` });
    expect(await prisma.invite.count({ where: { courseId: fx.course.id, email: `newcomer-${fx.course.id}@test.local` } })).toBe(1);

    const invalid = await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/assign`).set(mentor()).send({ emails: "nope" });
    expect(invalid.status).toBe(422);
  });

  it("requires payment when assigning a paid course to an existing learner", async () => {
    const existing = await prisma.user.create({ data: { email: `paid-assignee-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() } });
    createdUserIds.push(existing.id);
    await prisma.course.update({ where: { id: fx.course.id }, data: { pricingType: "PAID", priceCents: 1000, currency: "USD" } });
    try {
      const res = await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/assign`).set(mentor()).send({ emails: existing.email });
      expect(res.status).toBe(200);
      const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: fx.course.id, userId: existing.id } }, include: { payment: true } });
      expect(enrollment.lifecycle).toBe("PAYMENT_REQUIRED");
      expect(enrollment.payment).toMatchObject({ status: "PENDING", amountCents: 1000, currency: "USD" });
    } finally {
      await prisma.course.update({ where: { id: fx.course.id }, data: { pricingType: "FREE", priceCents: 0 } });
    }
  });

  it("creates one open invite link, reuses it, and revokes it", async () => {
    const first = await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/link`).set(mentor());
    expect(first.status).toBe(201);
    expect(first.body.data.reused).toBe(false);
    expect(first.body.data.url).toContain(`/invite/${first.body.data.token}`);

    const second = await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/link`).set(mentor());
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ token: first.body.data.token, reused: true });

    const roster = await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees`).set(mentor());
    expect(roster.body.data.linkInvite).toMatchObject({ token: first.body.data.token, url: first.body.data.url });
    expect(roster.body.data.pendingEmailInvites).toHaveLength(1);

    const invite = await prisma.invite.findUniqueOrThrow({ where: { token: first.body.data.token } });
    const revoke = await request(app).delete(`/api/v1/teach/courses/${fx.course.id}/invites/${invite.id}`).set(mentor());
    expect(revoke.status).toBe(204);
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt).not.toBeNull();
  });

  it("refuses invites on unpublished courses", async () => {
    await prisma.course.update({ where: { id: fx.course.id }, data: { status: "DRAFT" } });
    try {
      const res = await request(app).post(`/api/v1/teach/courses/${fx.course.id}/invites/link`).set(mentor());
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("COURSE_NOT_PUBLISHED");
    } finally {
      await prisma.course.update({ where: { id: fx.course.id }, data: { status: "PUBLISHED" } });
    }
  });
});

describe("enrollment tools", () => {
  it("explains when a nudge cannot be delivered and repairs progress rollups", async () => {
    const nudge = await request(app).post(`/api/v1/teach/enrollments/${fx.enrollment.id}/nudge`).set(mentor());
    expect(nudge.status).toBe(422);
    expect(nudge.body.code).toBe("EMAIL_NOT_CONFIGURED");

    // Real answers for chapter A, then corrupt the rollups and let the repair rebuild them.
    await request(app).post(`/api/v1/blocks/${fx.quizBlock.id}/respond`).set(learner()).send({ selected: ["a"] });
    await request(app).post(`/api/v1/blocks/${fx.mustReadBlock.id}/respond`).set(learner()).send({ complete: true });
    expect(
      (await request(app).post(`/api/v1/chapters/${fx.chapterA.id}/complete`).set(learner())).status
    ).toBe(204);
    await prisma.enrollment.update({ where: { id: fx.enrollment.id }, data: { chaptersCompleted: 0, percentComplete: 0, totalScore: 0 } });

    const repair = await request(app).post(`/api/v1/teach/enrollments/${fx.enrollment.id}/repair-progress`).set(mentor());
    expect(repair.status).toBe(204);
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(row.chaptersCompleted).toBe(1);
    expect(row.percentComplete).toBe(50);
    expect(row.totalScore).toBe(1);

    expect((await request(app).post("/api/v1/teach/enrollments/nope/nudge").set(mentor())).status).toBe(404);
  });
});
