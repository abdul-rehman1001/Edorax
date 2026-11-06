import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/db/prisma.js";
import { reactionForNotification } from "../../src/services/engagement/reactions.js";
import type { NotificationItem } from "../../src/shared/api/notifications.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;

beforeAll(async () => {
  fx = await createCourseFixture();
});
afterAll(async () => {
  await fx.cleanup();
});

const track = (body: object) =>
  request(app).post("/api/v1/events").set({ Authorization: `Bearer ${fx.learnerToken}` }).send(body);

describe("mascot reactions from the API", () => {
  const notes = (platform: string) => track({ type: "notes_saved", chapterId: fx.chapterA.id, platform });

  beforeEach(async () => {
    await prisma.engagementEvent.deleteMany({ where: { userId: fx.learner.id } });
  });
  afterEach(() => {
    env.MASCOT_SERVER_REACTIONS = true;
    env.MASCOT_ASSET_BASE_URL = undefined;
  });

  it("decides the reaction, with its voice clip as a full URL", async () => {
    const { data } = (await track({ type: "session_start" })).body;
    expect(data.reaction).toMatchObject({ version: 1, ruleId: "first-visit" });
    expect(data.reaction.voice).toBe(`${env.APP_URL}/brand/dot/voice/welcome.mp3`);
  });

  it("serves voice clips from the configured origin", async () => {
    env.MASCOT_ASSET_BASE_URL = "https://audio.example.com";
    const { data } = (await track({ type: "session_start" })).body;
    expect(data.reaction.voice).toBe("https://audio.example.com/brand/dot/voice/welcome.mp3");
  });

  it("says nothing about a moment already recorded, or an ambient one while reading", async () => {
    const reading = await track({ type: "session_start", reading: true, area: "chapter" });
    expect(reading.body.data.reaction).toBeNull();
    await prisma.engagementEvent.deleteMany({ where: { userId: fx.learner.id } });
    await track({ type: "enrolled", courseId: fx.course.id });
    expect((await track({ type: "enrolled", courseId: fx.course.id })).body.data.reaction).toBeNull();
  });

  it("holds a cooldown across devices", async () => {
    expect((await notes("web")).body.data.reaction).toMatchObject({ ruleId: "notes-saved" });
    expect((await notes("desktop")).body.data.reaction).toBeNull();
    expect((await notes("android")).body.data.reaction).toBeNull();

    const stamped = await prisma.engagementEvent.findMany({
      where: { userId: fx.learner.id, payload: { path: ["reactedRule"], equals: "notes-saved" } },
    });
    expect(stamped).toHaveLength(1);
  });

  it("reacts again once the cooldown has passed", async () => {
    await notes("web");
    await prisma.engagementEvent.updateMany({
      where: { userId: fx.learner.id },
      data: { createdAt: new Date(Date.now() - 11 * 60_000) },
    });
    expect((await notes("desktop")).body.data.reaction).toMatchObject({ ruleId: "notes-saved" });
  });

  it("accepts the desktop platform and rejects an unknown area", async () => {
    await notes("desktop");
    expect(await prisma.engagementEvent.count({ where: { userId: fx.learner.id, platform: "desktop" } })).toBe(1);
    expect((await track({ type: "session_start", area: "moon" })).status).toBe(400);
  });

  it("sends no decision when switched off, so the app falls back to its own rules", async () => {
    env.MASCOT_SERVER_REACTIONS = false;
    const { data } = (await track({ type: "session_start" })).body;
    expect(data.events).toHaveLength(1);
    expect(data).not.toHaveProperty("reaction");
  });

  it("gives the messenger's words to a live notification it announces, and none to the rest", () => {
    const item: NotificationItem = {
      id: "n1",
      type: "help.reply",
      category: "activity",
      title: "A reply",
      body: "",
      url: "/my-questions/1",
      courseId: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    expect(reactionForNotification(item)).toMatchObject({
      ruleId: "message-reply",
      action: { label: "Open", href: "/my-questions/1" },
    });
    expect(reactionForNotification({ ...item, type: "study.reminder" })).toBeUndefined();
    env.MASCOT_SERVER_REACTIONS = false;
    expect(reactionForNotification(item)).toBeUndefined();
  });
});
