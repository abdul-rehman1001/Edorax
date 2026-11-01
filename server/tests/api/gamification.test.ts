import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { awardXp } from "../../src/services/gamification/xp.js";
import { grantStreakFreeze } from "../../src/services/gamification/habit.js";
import { currentLeaderboardWeek, loadLeaderboard } from "../../src/services/gamification/leaderboard.js";
import { loadGamificationSummary } from "../../src/services/gamification/summary.js";
import { recordStudyHeartbeat } from "../../src/services/progress/heartbeat.js";
import { loadLearnerHabit } from "../../src/services/progress/learner-habit.js";
import { dateToDayKey, dayKeyToDate, localDayKey, shiftDayKey } from "../../src/shared/lib/local-date.js";
import { createCourseFixture, createOrganizationFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
const extraUserIds: string[] = [];
const flags = {
  GAMIFICATION_XP: env.GAMIFICATION_XP,
  GAMIFICATION_STREAK_FREEZES: env.GAMIFICATION_STREAK_FREEZES,
  GAMIFICATION_LEVELS: env.GAMIFICATION_LEVELS,
  GAMIFICATION_LEADERBOARDS: env.GAMIFICATION_LEADERBOARDS,
};

beforeAll(async () => {
  fx = await createCourseFixture();
});
afterEach(() => Object.assign(env, flags));
afterAll(async () => {
  await fx.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

const auth = (token = fx.learnerToken) => ({ Authorization: `Bearer ${token}` });
const respond = (blockId: string, body: object, token = fx.learnerToken) =>
  request(app).post(`/api/v1/blocks/${blockId}/respond`).set(auth(token)).send(body);
const submitQuiz = (optionId: string, token = fx.learnerToken) =>
  request(app)
    .post(`/api/v1/chapters/${fx.chapterB.id}/quiz/submit`)
    .set(auth(token))
    .send({ answers: fx.quizChapterBlocks.map((block) => ({ blockId: block.id, selected: [optionId] })) });
const track = (body: object, token = fx.learnerToken) => request(app).post("/api/v1/events").set(auth(token)).send(body);
const markComplete = (chapterId: string, token = fx.learnerToken) =>
  request(app).post(`/api/v1/chapters/${chapterId}/complete`).set(auth(token));
const xpRows = (userId = fx.learner.id) => prisma.xpEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function extraLearner(name: string, options: { organizationId?: string } = {}) {
  const user = await prisma.user.create({
    data: { email: `${name.toLowerCase().replace(/\W/g, "")}-${fx.tag}-${extraUserIds.length}@test.local`, name, role: "MENTEE", emailVerified: new Date() },
  });
  extraUserIds.push(user.id);
  const enrollment = await prisma.enrollment.create({
    data: {
      courseId: fx.course.id,
      userId: user.id,
      lifecycle: "ACTIVE",
      status: "IN_PROGRESS",
      source: "DIRECT",
      startedAt: new Date(),
      organizationId: options.organizationId ?? null,
    },
  });
  const token = (await createSession(user.id)).sessionToken;
  return { user, enrollment, token };
}

describe("XP", () => {
  it("awards a chapter once, inside the progress transaction, and nothing for a retry", async () => {
    expect((await respond(fx.quizBlock.id, { selected: ["a"] })).status).toBe(200);
    expect(await xpRows()).toHaveLength(0); // chapter not complete yet
    expect((await respond(fx.mustReadBlock.id, { complete: true })).status).toBe(200);
    expect(await xpRows()).toHaveLength(0); // checkpoints alone do not finish the chapter
    expect((await markComplete(fx.chapterA.id)).status).toBe(204);

    const rows = await xpRows();
    expect(rows).toEqual([
      expect.objectContaining({ source: "chapter_completed", sourceKey: `chapter:${fx.chapterA.id}`, amount: 20, courseId: fx.course.id, enrollmentId: fx.enrollment.id }),
    ]);

    // Answering again recomputes progress; the key stops a second award.
    expect((await respond(fx.quizBlock.id, { selected: ["a"] })).status).toBe(200);
    expect(await xpRows()).toHaveLength(1);
    const [user, enrollment] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } }),
      prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } }),
    ]);
    expect(user.xpTotal).toBe(20);
    expect(enrollment.xpTotal).toBe(20);
  });

  it("pays a quiz pass by try, a perfect score and the course, then reports it once with a level-up", async () => {
    expect((await submitQuiz("b")).status).toBe(200); // first try, wrong
    expect((await xpRows()).map((row) => row.source)).toEqual(["chapter_completed"]);

    expect((await submitQuiz("a")).status).toBe(200); // second try, all right, makes the chapter eligible
    expect((await markComplete(fx.chapterB.id)).status).toBe(204);
    const sources = (await xpRows()).map((row) => [row.source, row.amount]);
    expect(sources).toEqual(
      expect.arrayContaining([
        ["chapter_completed", 20],
        ["quiz_passed", 10],
        ["quiz_perfect", 5],
        ["course_completed", 100],
      ])
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).xpTotal).toBe(155);

    const first = await track({ type: "quiz_submitted", chapterId: fx.chapterB.id });
    expect(first.status).toBe(200);
    expect(first.body.data.rewards).toEqual({ xp: 135 });
    expect(first.body.data.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(["quiz_submitted", "chapter_completed", "course_completed", "level_up"])
    );
    expect(first.body.data.events.find((event: { type: string }) => event.type === "level_up").payload).toEqual({ level: 2 });

    const again = await track({ type: "quiz_submitted", chapterId: fx.chapterB.id });
    expect(again.body.data.rewards).toBeUndefined();
    expect(again.body.data.events.some((event: { type: string; isNew: boolean }) => event.type === "level_up")).toBe(false);
  });

  it("rebuilds the cached totals exactly from the ledger", async () => {
    const sum = await prisma.xpEntry.aggregate({ where: { userId: fx.learner.id }, _sum: { amount: true } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } });
    expect(user.xpTotal).toBe(sum._sum.amount);
  });

  it("never pays mentors, dropped enrollments, or anyone while XP is switched off", async () => {
    const award = (userId: string, enrollmentId: string | null, key: string) =>
      prisma.$transaction((tx) =>
        awardXp(tx, { userId, enrollmentId, courseId: fx.course.id, source: "chapter_completed", sourceKey: key })
      );
    expect(await award(fx.mentor.id, null, "test:mentor")).toBe(0);

    const dropped = await extraLearner("Dropped Learner");
    await prisma.enrollment.update({ where: { id: dropped.enrollment.id }, data: { status: "DROPPED" } });
    expect(await award(dropped.user.id, dropped.enrollment.id, "test:dropped")).toBe(0);

    env.GAMIFICATION_XP = false;
    expect(await award(fx.learner.id, fx.enrollment.id, "test:off")).toBe(0);
    expect(await prisma.xpEntry.count({ where: { sourceKey: { startsWith: "test:" } } })).toBe(0);
  });

  it("caps chapters that are easy to farm at five a day", async () => {
    const results: number[] = [];
    for (let n = 0; n < 7; n += 1) {
      results.push(
        await prisma.$transaction((tx) =>
          awardXp(tx, {
            userId: fx.learner.id,
            enrollmentId: fx.enrollment.id,
            courseId: fx.course.id,
            source: "light_chapter_completed",
            sourceKey: `light:${n}`,
          })
        )
      );
    }
    expect(results).toEqual([10, 10, 10, 10, 10, 0, 0]);
    await prisma.xpEntry.deleteMany({ where: { userId: fx.learner.id, source: "light_chapter_completed" } });
    await prisma.user.update({ where: { id: fx.learner.id }, data: { xpTotal: { decrement: 50 } } });
    await prisma.enrollment.update({ where: { id: fx.enrollment.id }, data: { xpTotal: { decrement: 50 } } });
  });
});

describe("weekly goal and streak freezes", () => {
  it("pays a met weekly goal once a week, with XP and a freeze", async () => {
    await prisma.user.update({ where: { id: fx.learner.id }, data: { weeklyGoalKind: "CHAPTERS", weeklyGoalTarget: 1 } });
    const first = await track({ type: "session_start" });
    const goal = first.body.data.events.find((event: { type: string }) => event.type === "weekly_goal_met");
    expect(goal).toMatchObject({ isNew: true, payload: { freezeEarned: true } });
    expect(first.body.data.rewards).toEqual({ xp: 25 }); // the goal's XP, shown with its reaction

    const again = await track({ type: "session_start" });
    expect(again.body.data.events.some((event: { type: string }) => event.type === "weekly_goal_met")).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } });
    expect(user.streakFreezes).toBe(1);
    expect(await prisma.xpEntry.count({ where: { userId: fx.learner.id, source: "weekly_goal_met" } })).toBe(1);
  });

  it("never holds more than two freezes", async () => {
    expect(await prisma.$transaction((tx) => grantStreakFreeze(tx, fx.learner.id))).toBe(true);
    expect(await prisma.$transaction((tx) => grantStreakFreeze(tx, fx.learner.id))).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).streakFreezes).toBe(2);
  });

  it("spends a freeze on a bridgeable gap once, even when two pages ask at the same moment", async () => {
    await prisma.dailyActivity.deleteMany({ where: { enrollmentId: fx.enrollment.id } });
    const today = localDayKey(new Date(), "UTC");
    // Studied today and four and five days ago: a three-day gap (grace + two freezes).
    for (const offset of [0, -4, -5]) {
      await prisma.dailyActivity.create({
        data: { enrollmentId: fx.enrollment.id, date: dayKeyToDate(shiftDayKey(today, offset)), activeSeconds: 120 },
      });
    }

    const [a, b] = await Promise.all([loadLearnerHabit(fx.learner.id), loadLearnerHabit(fx.learner.id)]);
    expect(a.streakCount).toBe(3);
    expect(b.streakCount).toBe(3);
    const frozen = await prisma.streakFreezeDay.findMany({ where: { userId: fx.learner.id }, orderBy: { date: "desc" } });
    expect(frozen.map((row) => row.date.toISOString().slice(0, 10))).toEqual([shiftDayKey(today, -2), shiftDayKey(today, -3)]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).streakFreezes).toBe(0);

    // Later reads count the covered days without spending again.
    expect((await loadLearnerHabit(fx.learner.id)).streakCount).toBe(3);
    expect(await prisma.streakFreezeDay.count({ where: { userId: fx.learner.id } })).toBe(2);
  });

  it("does not spend freezes while they are switched off", async () => {
    await prisma.user.update({ where: { id: fx.learner.id }, data: { streakFreezes: 2 } });
    await prisma.streakFreezeDay.deleteMany({ where: { userId: fx.learner.id } });
    env.GAMIFICATION_STREAK_FREEZES = false;
    expect((await loadLearnerHabit(fx.learner.id)).streakCount).toBe(1);
    expect(await prisma.streakFreezeDay.count({ where: { userId: fx.learner.id } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).streakFreezes).toBe(2);
  });

  it("writes study time on the learner's own calendar day", async () => {
    await prisma.userProfile.upsert({
      where: { userId: fx.learner.id },
      create: { userId: fx.learner.id, timezone: "Pacific/Kiritimati", skills: [] },
      update: { timezone: "Pacific/Kiritimati" },
    });
    await prisma.dailyActivity.deleteMany({ where: { enrollmentId: fx.enrollment.id } });
    await prisma.studySession.create({ data: { enrollmentId: fx.enrollment.id, chapterId: fx.chapterA.id, status: "RUNNING" } });
    await prisma.$transaction((tx) =>
      recordStudyHeartbeat(tx, {
        enrollmentId: fx.enrollment.id,
        userId: fx.learner.id,
        chapterId: fx.chapterA.id,
        courseId: fx.course.id,
        deltaSeconds: 15,
      })
    );
    const [row] = await prisma.dailyActivity.findMany({ where: { enrollmentId: fx.enrollment.id } });
    // UTC+14: almost always a day ahead of UTC.
    expect(row!.date.toISOString().slice(0, 10)).toBe(localDayKey(new Date(), "Pacific/Kiritimati"));
    expect((await loadLearnerHabit(fx.learner.id)).streakCount).toBe(1);
    await prisma.userProfile.update({ where: { userId: fx.learner.id }, data: { timezone: "UTC" } });
  });
});

describe("dashboard and preferences", () => {
  it("shows XP, level, freezes, course XP and the module stage", async () => {
    const res = await request(app).get("/api/v1/learner/dashboard").set(auth());
    expect(res.status).toBe(200);
    const { gamification, courses } = res.body.data;
    expect(gamification.features).toEqual({ xp: true, streakFreezes: true, levels: true, career: true, credits: true, leaderboards: true });
    expect(gamification.credits).toMatchObject({ balance: expect.any(Number) });
    expect(gamification.xp.total).toBe(180);
    expect(gamification.level).toMatchObject({ level: 2, totalXp: 180, toNext: 20 });
    expect(gamification.freezes).toMatchObject({ max: 2 });
    expect(courses[0]).toMatchObject({ xp: 155, stage: { current: 1, total: 1, title: "Module 1" } });
  });

  it("drops each switched-off feature from the dashboard", async () => {
    env.GAMIFICATION_LEVELS = false;
    env.GAMIFICATION_STREAK_FREEZES = false;
    let data = (await request(app).get("/api/v1/learner/dashboard").set(auth())).body.data;
    expect(data.gamification).toMatchObject({ level: null, freezes: null, xp: { total: 180 } });
    expect(data.courses[0]).toMatchObject({ stage: null, xp: 155 });

    env.GAMIFICATION_XP = false;
    data = (await request(app).get("/api/v1/learner/dashboard").set(auth())).body.data;
    expect(data.gamification.features).toEqual({ xp: false, streakFreezes: false, levels: false, career: false, credits: false, leaderboards: false });
    expect(data.gamification.xp).toBeNull();
    expect(data.courses[0].xp).toBeNull();
  });

  it("hides game elements on request and validates the body", async () => {
    expect((await request(app).patch("/api/v1/learner/gamification").set(auth()).send({})).status).toBe(400);
    const hidden = await request(app).patch("/api/v1/learner/gamification").set(auth()).send({ hidden: true });
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.hidden).toBe(true);
    const data = (await request(app).get("/api/v1/learner/dashboard").set(auth())).body.data;
    expect(data.courses[0].xp).toBeNull();
    // XP still accrues while hidden; only the display changes.
    expect(data.gamification.xp.total).toBe(180);
    await request(app).patch("/api/v1/learner/gamification").set(auth()).send({ hidden: false });
  });
});

describe("leaderboards", () => {
  it("asks for opt-in, then ranks opted-in learners by this week's course XP", async () => {
    const board = () => request(app).get(`/api/v1/learner/leaderboard?courseId=${fx.course.id}`).set(auth());
    expect((await request(app).get("/api/v1/learner/leaderboard").set(auth())).status).toBe(400);
    expect((await board()).body.data).toMatchObject({ status: "opt_in_required", courseId: fx.course.id });

    const ada = await extraLearner("Ada Lovelace");
    const shy = await extraLearner("Shy Person"); // never opts in
    await prisma.user.update({ where: { id: ada.user.id }, data: { leaderboardOptIn: true } });
    await prisma.$transaction((tx) =>
      awardXp(tx, { userId: ada.user.id, enrollmentId: ada.enrollment.id, courseId: fx.course.id, source: "course_completed", sourceKey: "ada:1" })
    );
    await prisma.$transaction((tx) =>
      awardXp(tx, { userId: shy.user.id, enrollmentId: shy.enrollment.id, courseId: fx.course.id, source: "course_completed", sourceKey: "shy:1" })
    );

    await request(app).patch("/api/v1/learner/gamification").set(auth()).send({ leaderboardOptIn: true });
    const ready = (await board()).body.data;
    expect(ready).toMatchObject({ status: "ready", groupSize: 2, you: { rank: 1, xp: 155 }, lastWeek: null });
    expect(ready.entries).toEqual([
      { rank: 1, name: "Test L.", xp: 155, isYou: true },
      { rank: 2, name: "Ada L.", xp: 100, isYou: false },
    ]);
    expect(JSON.stringify(ready)).not.toContain("Shy");
    expect(JSON.stringify(ready)).not.toContain("@");
  });

  it("removes learners who opt out, hide game elements or drop the course", async () => {
    const ranked = async () => (await loadLeaderboard(fx.learner.id, fx.course.id)) as Extract<Awaited<ReturnType<typeof loadLeaderboard>>, { status: "ready" }>;
    const ada = await prisma.user.findFirstOrThrow({ where: { id: { in: extraUserIds }, name: "Ada Lovelace" } });

    await prisma.user.update({ where: { id: ada.id }, data: { gamificationHidden: true } });
    expect((await ranked()).groupSize).toBe(1);
    await prisma.user.update({ where: { id: ada.id }, data: { gamificationHidden: false } });
    expect((await ranked()).groupSize).toBe(2);

    await prisma.enrollment.update({ where: { courseId_userId: { courseId: fx.course.id, userId: ada.id } }, data: { status: "DROPPED" } });
    expect((await ranked()).groupSize).toBe(1);
    await prisma.enrollment.update({ where: { courseId_userId: { courseId: fx.course.id, userId: ada.id } }, data: { status: "IN_PROGRESS" } });

    const adaToken = (await createSession(ada.id)).sessionToken;
    await request(app).patch("/api/v1/learner/gamification").set(auth(adaToken)).send({ leaderboardOptIn: false });
    expect(await prisma.leaderboardMember.count({ where: { userId: ada.id } })).toBe(0);
    expect((await ranked()).groupSize).toBe(1);
  });

  it("keeps one board per course and organization, however many join", async () => {
    const week = (await prisma.leaderboardMember.findFirstOrThrow({ where: { userId: fx.learner.id } })).weekKey;
    await prisma.leaderboardMember.deleteMany({ where: { courseId: fx.course.id } });
    await prisma.leaderboardGroup.deleteMany({ where: { courseId: fx.course.id } });

    const board = await prisma.leaderboardGroup.create({ data: { courseId: fx.course.id, weekKey: week } });
    const fillers = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 40 }, (_, n) => ({ email: `filler-${n}-${fx.tag}@test.local`, name: `Filler ${n}`, role: "MENTEE" as const })),
    });
    extraUserIds.push(...fillers.map((user) => user.id));
    await prisma.leaderboardMember.createMany({
      data: fillers.map((user) => ({ groupId: board.id, userId: user.id, courseId: fx.course.id, weekKey: week })),
    });

    const view = await loadLeaderboard(fx.learner.id, fx.course.id);
    expect(view.status).toBe("ready");
    const member = await prisma.leaderboardMember.findFirstOrThrow({ where: { userId: fx.learner.id } });
    expect(member.groupId).toBe(board.id);
    expect(await prisma.leaderboardGroup.count({ where: { courseId: fx.course.id } })).toBe(1);
  });

  it("ranks learners seated in separate groups under the old cap on one board", async () => {
    const week = (await prisma.leaderboardMember.findFirstOrThrow({ where: { userId: fx.learner.id } })).weekKey;
    await prisma.leaderboardMember.deleteMany({ where: { courseId: fx.course.id } });
    await prisma.leaderboardGroup.deleteMany({ where: { courseId: fx.course.id } });

    const [older, newer] = [
      await prisma.leaderboardGroup.create({ data: { courseId: fx.course.id, weekKey: week } }),
      await prisma.leaderboardGroup.create({ data: { courseId: fx.course.id, weekKey: week } }),
    ];
    const other = await extraLearner("Split Learner");
    await prisma.user.update({ where: { id: other.user.id }, data: { leaderboardOptIn: true } });
    await prisma.leaderboardMember.createMany({
      data: [
        { groupId: older.id, userId: fx.learner.id, courseId: fx.course.id, weekKey: week },
        { groupId: newer.id, userId: other.user.id, courseId: fx.course.id, weekKey: week },
      ],
    });

    const view = await loadLeaderboard(fx.learner.id, fx.course.id);
    if (view.status !== "ready") throw new Error(`expected a ready board, got ${view.status}`);
    expect(view.groupSize).toBe(2);
    expect(view.entries.map((entry) => entry.isYou).sort()).toEqual([false, true]);
  });

  it("respects an organization that switches boards off, and the admin switch", async () => {
    const org = await createOrganizationFixture(fx.course.id);
    try {
      const member = await extraLearner("Org Learner", { organizationId: org.organization.id });
      await prisma.user.update({ where: { id: member.user.id }, data: { leaderboardOptIn: true } });
      const view = () => request(app).get(`/api/v1/learner/leaderboard?courseId=${fx.course.id}`).set(auth(member.token));
      expect((await view()).body.data.status).toBe("ready");

      const admin = await prisma.user.create({
        data: { email: `admin-${fx.tag}@test.local`, name: "Admin", role: "ADMIN", emailVerified: new Date() },
      });
      extraUserIds.push(admin.id);
      const adminToken = (await createSession(admin.id)).sessionToken;
      const toggle = (token: string, enabled: boolean) =>
        request(app)
          .patch(`/api/v1/admin/organizations/${org.organization.id}/allocations/${fx.course.id}/leaderboard`)
          .set(auth(token))
          .send({ enabled });
      expect((await toggle(fx.learnerToken, false)).status).toBe(403);
      expect((await toggle(adminToken, false)).status).toBe(204);
      expect((await view()).body.data).toMatchObject({ status: "unavailable", reason: "organization_disabled" });

      const detail = await request(app).get(`/api/v1/admin/organizations/${org.organization.id}`).set(auth(adminToken));
      expect(detail.body.data.allocations[0]).toMatchObject({ leaderboardEnabled: false });
      expect((await toggle(adminToken, true)).status).toBe(204);
      expect((await view()).body.data.status).toBe("ready");
    } finally {
      await prisma.enrollment.deleteMany({ where: { organizationId: org.organization.id } });
      await org.cleanup();
    }
  });

  it("is disabled when leaderboards or XP are switched off", async () => {
    env.GAMIFICATION_LEADERBOARDS = false;
    expect(await loadLeaderboard(fx.learner.id, fx.course.id)).toEqual({ status: "disabled" });
    env.GAMIFICATION_LEADERBOARDS = true;
    env.GAMIFICATION_XP = false;
    expect(await loadLeaderboard(fx.learner.id, fx.course.id)).toEqual({ status: "disabled" });
  });

  it("names last week's top three once, and keeps a finished week's places when a winner opts out", async () => {
    const thisWeek = dateToDayKey(currentLeaderboardWeek());
    const lastWeek = dayKeyToDate(shiftDayKey(thisWeek, -7));
    const { organizationId } = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    const board = await prisma.leaderboardGroup.create({ data: { courseId: fx.course.id, organizationId, weekKey: lastWeek } });

    const people = [];
    for (const [name, xp] of [["Gold Winner", 90], ["Bronze Winner", 30], ["Fourth Place", 10], ["Zero Person", 0]] as const) {
      const learner = await extraLearner(name);
      await prisma.user.update({ where: { id: learner.user.id }, data: { leaderboardOptIn: true } });
      people.push({ ...learner, xp });
    }
    const scored = [...people, { user: fx.learner, xp: 60 }];
    await prisma.leaderboardMember.createMany({
      data: scored.map(({ user }) => ({ groupId: board.id, userId: user.id, courseId: fx.course.id, weekKey: lastWeek })),
    });
    await prisma.xpEntry.createMany({
      data: scored
        .filter(({ xp }) => xp > 0)
        .map(({ user, xp }) => ({ userId: user.id, courseId: fx.course.id, source: "test", sourceKey: `last-week:${fx.tag}`, amount: xp, dayKey: lastWeek, weekKey: lastWeek })),
    });

    // Two pages reading the board at once settle it once.
    const [view] = await Promise.all([loadLeaderboard(fx.learner.id, fx.course.id), loadLeaderboard(fx.learner.id, fx.course.id)]);
    if (view.status !== "ready") throw new Error(`expected a ready board, got ${view.status}`);
    expect(view.lastWeek).toEqual({
      weekStart: dateToDayKey(lastWeek),
      winners: [
        { rank: 1, name: "Gold W.", xp: 90, isYou: false },
        { rank: 2, name: "Test L.", xp: 60, isYou: true },
        { rank: 3, name: "Bronze W.", xp: 30, isYou: false },
      ],
    });
    expect(await prisma.leaderboardPlacement.count({ where: { courseId: fx.course.id, weekKey: lastWeek } })).toBe(3);
    expect((await prisma.leaderboardGroup.findUniqueOrThrow({ where: { id: board.id } })).settledAt).not.toBeNull();

    // A winner who opts out is no longer named, and nobody moves up into the finished week's places.
    await prisma.user.update({ where: { id: people[0]!.user.id }, data: { leaderboardOptIn: false } });
    const after = await loadLeaderboard(fx.learner.id, fx.course.id);
    if (after.status !== "ready") throw new Error(`expected a ready board, got ${after.status}`);
    expect(after.lastWeek?.winners.map((winner) => [winner.rank, winner.name])).toEqual([
      [2, "Test L."],
      [3, "Bronze W."],
    ]);
    expect(await prisma.leaderboardPlacement.count({ where: { courseId: fx.course.id, weekKey: lastWeek } })).toBe(3);
  });

  it("counts top-three finishes on the summary, settling boards nobody opened", async () => {
    const thisWeek = dateToDayKey(currentLeaderboardWeek());
    const twoWeeksAgo = dayKeyToDate(shiftDayKey(thisWeek, -14));
    const { organizationId } = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    const board = await prisma.leaderboardGroup.create({ data: { courseId: fx.course.id, organizationId, weekKey: twoWeeksAgo } });
    await prisma.leaderboardMember.create({ data: { groupId: board.id, userId: fx.learner.id, courseId: fx.course.id, weekKey: twoWeeksAgo } });
    await prisma.xpEntry.create({
      data: { userId: fx.learner.id, courseId: fx.course.id, source: "test", sourceKey: `two-weeks-ago:${fx.tag}`, amount: 20, dayKey: twoWeeksAgo, weekKey: twoWeeksAgo },
    });

    const summary = await loadGamificationSummary(fx.learner.id);
    expect(summary.topThree).toEqual({
      count: 2,
      latest: { rank: 2, courseTitle: fx.course.title, weekStart: shiftDayKey(thisWeek, -7) },
    });
    const fourth = await prisma.user.findFirstOrThrow({ where: { id: { in: extraUserIds }, name: "Fourth Place" } });
    expect((await loadGamificationSummary(fourth.id)).topThree).toBeNull();

    env.GAMIFICATION_LEADERBOARDS = false;
    expect((await loadGamificationSummary(fx.learner.id)).topThree).toBeNull();
  });

  it("404s for a course the learner is not enrolled in", async () => {
    const res = await request(app).get("/api/v1/learner/leaderboard?courseId=missing-course").set(auth());
    expect(res.status).toBe(404);
  });
});
