import { describe, expect, it, vi } from "vitest";
import type { RecordedEngagementEvent, TrackEventResult } from "../../../../src/shared/api/engagement.js";
import { createEngagementEngine } from "../../../../src/shared/engagement/engine.js";
import { MASCOT_REACTION_VERSION, decideReaction, readReaction } from "../../../../src/shared/engagement/reactions.js";

const recorded = (partial: Partial<RecordedEngagementEvent> & Pick<RecordedEngagementEvent, "type">) =>
  ({ id: "evt", courseId: null, chapterId: "chapter", isNew: true, createdAt: "", payload: {}, ...partial }) as RecordedEngagementEvent;

describe("decideReaction", () => {
  it("picks the highest-priority rule and stamps the format version", () => {
    const decision = decideReaction([recorded({ type: "chapter_completed" }), recorded({ type: "course_completed" })]);
    expect(decision?.rule.id).toBe("course-graduation");
    expect(decision?.reaction).toMatchObject({ version: MASCOT_REACTION_VERSION, ruleId: "course-graduation" });
  });

  it("makes voice clips absolute when given the origin that serves them", () => {
    const events = [recorded({ type: "chapter_completed" })];
    expect(decideReaction(events)?.reaction.voice).toBe("/brand/dot/voice/lesson-done.mp3");
    expect(decideReaction(events, { assetBase: "https://audio.example.com" })?.reaction.voice).toBe(
      "https://audio.example.com/brand/dot/voice/lesson-done.mp3"
    );
  });

  it("holds an ambient reaction back while the learner reads", () => {
    const events = [recorded({ type: "session_start", payload: { daysAway: null } })];
    expect(decideReaction(events, { reading: false })?.rule.id).toBe("first-visit");
    expect(decideReaction(events, { reading: true })).toBeNull();
  });

  it("skips a rule that is cooling down and ignores events already recorded", () => {
    expect(decideReaction([recorded({ type: "notes_saved" })], { coolingDown: () => true })).toBeNull();
    expect(decideReaction([recorded({ type: "chapter_completed", isNew: false })])).toBeNull();
  });
});

describe("readReaction", () => {
  const valid = decideReaction([recorded({ type: "chapter_completed" })])!.reaction;

  it("keeps a reaction this app understands", () => {
    expect(readReaction(valid)).toEqual(valid);
  });

  it("rejects what cannot be shown", () => {
    expect(readReaction(null)).toBeNull();
    expect(readReaction("Lesson done!")).toBeNull();
    expect(readReaction({ ...valid, message: "" })).toBeNull();
    expect(readReaction({ ruleId: "x", message: "Hello" })).toBeNull();
  });

  it("skips a reaction from a newer format, and reads one from before versions existed", () => {
    expect(readReaction({ ...valid, version: MASCOT_REACTION_VERSION + 1 })).toBeNull();
    const { version: _version, ...unversioned } = valid;
    expect(readReaction(unversioned)?.ruleId).toBe(valid.ruleId);
  });

  it("keeps a reaction but drops the optional parts it does not recognise", () => {
    const read = readReaction({ ...valid, voice: "javascript:alert(1)", xp: "lots", action: { label: "Go", href: "//evil.example" } });
    expect(read).toMatchObject({ ruleId: valid.ruleId, message: valid.message });
    expect(read).not.toHaveProperty("voice");
    expect(read).not.toHaveProperty("xp");
    expect(read).not.toHaveProperty("action");
    expect(readReaction({ ...valid, action: { label: "New", intent: "open-camera" } })).not.toHaveProperty("action");
  });

  it("shows a state or a field added by a newer release", () => {
    expect(readReaction({ ...valid, state: "moon_dance", confetti: "lots" })).toMatchObject({ state: "moon_dance" });
  });
});

describe("engagement engine with server decisions", () => {
  function setup(result: TrackEventResult) {
    const present = vi.fn();
    const engine = createEngagementEngine({ platform: "desktop", transport: async () => result, present });
    return { engine, present };
  }
  const chapter = [recorded({ type: "chapter_completed" })];
  const reaction = decideReaction(chapter)!.reaction;

  it("shows the server's reaction instead of deciding", async () => {
    const { engine, present } = setup({ events: chapter, reaction: { ...reaction, message: "From the server" } });
    await engine.track({ type: "chapter_completed", chapterId: "chapter" });
    expect(present).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "From the server" }));
  });

  it("stays quiet when the server decided on no reaction", async () => {
    const { engine, present } = setup({ events: chapter, reaction: null });
    expect(await engine.track({ type: "chapter_completed", chapterId: "chapter" })).toBeNull();
    expect(present).not.toHaveBeenCalled();
  });

  it("decides locally when an older API sent no decision", async () => {
    const { engine, present } = setup({ events: chapter });
    await engine.track({ type: "chapter_completed", chapterId: "chapter" });
    expect(present).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ruleId: "chapter-completed" }));
  });

  it("tells the server when the learner is reading and where they are", async () => {
    const transport = vi.fn(async () => ({ events: [], reaction: null }));
    const engine = createEngagementEngine({
      platform: "desktop",
      transport,
      present: () => undefined,
      isReading: () => true,
      area: () => "chapter",
    });
    await engine.track({ type: "session_start" });
    expect(transport).toHaveBeenCalledWith({ type: "session_start", platform: "desktop", reading: true, area: "chapter" });
  });

  it("shows a pushed reaction, and ignores one it cannot read", () => {
    const { engine, present } = setup({ events: [] });
    expect(engine.show({ nonsense: true })).toBeNull();
    expect(present).not.toHaveBeenCalled();
    engine.show(reaction);
    expect(present).toHaveBeenCalledOnce();
  });
});
