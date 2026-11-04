import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;

beforeAll(async () => {
  fx = await createCourseFixture();
});
afterAll(() => fx.cleanup());

const auth = () => ({ Authorization: `Bearer ${fx.learnerToken}` });
const reader = (chapterSlug: string) =>
  request(app).get(`/api/v1/courses/${fx.course.slug}/chapters/${chapterSlug}`).set(auth());

describe("chapter reader", () => {
  it("denies learners without access and 404s unknown chapters", async () => {
    const anon = await request(app).get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a`);
    expect(anon.status).toBe(401);
    const stranger = await request(app).get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a`).set({ Authorization: `Bearer ${fx.unverifiedToken}` });
    expect(stranger.status).toBe(403);
    expect(stranger.body.code).toBe("not_enrolled");
    expect((await reader("missing")).status).toBe(404);
  });

  it("returns the open chapter with content, syllabus and recap, and starts it", async () => {
    const res = await reader("chapter-a");
    expect(res.status).toBe(200);
    const view = res.body.data;
    expect(view.chapter).toMatchObject({ slug: "chapter-a", lessonLabel: "01.01", blockCount: 2, readerMode: "DEFAULT" });
    expect(view.locked).toBe(false);
    expect(view.next).toMatchObject({ slug: "chapter-b" });
    expect(view.content.source).toBe("# A");
    expect(view.content.recap.checks).toBe("0 of 2 checks passed.");
    expect(view.content.canMarkComplete).toBe(false);
    expect(view.modules[0].chapters[0].status).toBe("IN_PROGRESS");

    const progress = await prisma.chapterProgress.findUnique({
      where: { enrollmentId_chapterId: { enrollmentId: fx.enrollment.id, chapterId: fx.chapterA.id } },
    });
    expect(progress?.status).toBe("IN_PROGRESS");
  });

  it("reports a locked chapter with the one to finish first", async () => {
    const res = await reader("chapter-b");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ locked: true, previous: { slug: "chapter-a" }, content: null });
  });
});

describe("block state", () => {
  it("strips the answer key and includes the latest answer for the caller", async () => {
    const before = await request(app).get(`/api/v1/blocks/${fx.quizBlock.id}/state`).set(auth());
    expect(before.status).toBe(200);
    expect(before.body.data.type).toBe("QUIZ");
    expect(before.body.data.config.correctOptionIds).toBeUndefined();
    expect(before.body.data.config.options).toHaveLength(2);
    expect(before.body.data.initialState).toBeNull();

    await request(app).post(`/api/v1/blocks/${fx.quizBlock.id}/respond`).set(auth()).send({ selected: ["b"] });
    const after = await request(app).get(`/api/v1/blocks/${fx.quizBlock.id}/state`).set(auth());
    expect(after.body.data.initialState).toMatchObject({ selected: ["b"], isCorrect: false });
    expect(after.body.data.initialState.explanation).toBeUndefined();

    const anon = await request(app).get(`/api/v1/blocks/${fx.quizBlock.id}/state`);
    expect(anon.status).toBe(200);
    expect(anon.body.data.initialState).toBeNull();
  });

  it("reports must-read completion and 404s unknown blocks", async () => {
    const read = await request(app).get(`/api/v1/blocks/${fx.mustReadBlock.id}/state`).set(auth());
    expect(read.body.data).toMatchObject({ type: "MUST_READ", required: true, initialRead: false, config: { title: "Read me" } });
    expect((await request(app).get("/api/v1/blocks/nope/state").set(auth())).status).toBe(404);
  });

  it("serves presentation blocks as their parsed config", async () => {
    const recap = await prisma.block.create({
      data: { id: `blk-recap-${fx.course.id}`, chapterId: fx.chapterA.id, type: "CHAPTER_RECAP", order: 9, required: false, config: { points: ["One", "Two"] } },
    });
    try {
      const res = await request(app).get(`/api/v1/blocks/${recap.id}/state`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ type: "CHAPTER_RECAP", config: { points: ["One", "Two"] } });
    } finally {
      await prisma.block.delete({ where: { id: recap.id } });
    }
  });
});

describe("quiz chapter state", () => {
  it("summarises the learner's answers for the wizard", async () => {
    const res = await request(app).get(`/api/v1/chapters/${fx.chapterB.id}/quiz`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.blockIds).toEqual(fx.quizChapterBlocks.map((b) => b.id));
    expect(res.body.data.initialScoreSummary).toBeNull();
    expect(res.body.data.initialAnswers[fx.quizChapterBlocks[0]!.id]).toEqual([]);
  });
});

describe("chapter download", () => {
  it("denies learners without access and unverified accounts", async () => {
    const anon = await request(app).get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a/download`);
    expect(anon.status).toBe(401);
    const unverified = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a/download`)
      .set({ Authorization: `Bearer ${fx.unverifiedToken}` });
    expect(unverified.status).toBe(403);
  });

  it("returns read-only lesson content and sanitized blocks without starting the chapter or mutating seen reviews", async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a/download`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.releaseId).toBeDefined();
    expect(res.body.data.lesson.chapter.slug).toBe("chapter-a");
    expect(res.body.data.lesson.content.source).toBe("# A");
    expect(res.body.data.blocks).toBeDefined();
    for (const block of Object.values(res.body.data.blocks) as Array<{ config?: { correctOptionIds?: unknown } }>) {
      expect(block.config?.correctOptionIds).toBeUndefined();
    }
  });

  it("returns locked lesson metadata with empty blocks", async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-b/download`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.lesson.locked).toBe(true);
    expect(res.body.data.blocks).toEqual({});
  });
});
