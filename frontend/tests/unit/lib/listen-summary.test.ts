import { describe, expect, it } from "vitest";
import { chapterTitleFromSlug, formatListenTotal, listenHref, summarizeManifest } from "../../../src/lib/listen-summary";
import { COURSE_CATEGORY_INFO, categoryFromParam } from "../../../src/lib/course-categories";
import { COURSE_CATEGORIES } from "../../../src/shared/domain/enums";

describe("summarizeManifest", () => {
  it("lists chapters with audio in course order and sums their minutes", () => {
    const summary = summarizeManifest({
      version: 1,
      chapters: {
        "2-1-set-the-scene": { file: "02.01-set-the-scene.mp3", minutes: 2.8, bytes: 1 },
        "1-10-wrap-up": { file: "01.10-wrap-up.mp3", minutes: 1.5, bytes: 1 },
        "1-2-roles-and-expectations": { file: "01.02-roles-and-expectations.mp3", minutes: 3.7, bytes: 1 },
        "1-3-broken": { file: "../evil.sh", minutes: 2, bytes: 1 },
        "1-4-empty": { file: "01.04-empty.mp3", minutes: 0, bytes: 1 },
      },
    });
    expect(summary?.chapters.map((c) => c.slug)).toEqual(["1-2-roles-and-expectations", "1-10-wrap-up", "2-1-set-the-scene"]);
    expect(summary?.chapters[0]?.title).toBe("Roles and expectations");
    expect(summary?.totalMinutes).toBeCloseTo(8);
  });

  it("returns null when nothing is playable", () => {
    expect(summarizeManifest(null)).toBeNull();
    expect(summarizeManifest({ chapters: {} })).toBeNull();
    expect(summarizeManifest("<html>Not Found</html>")).toBeNull();
  });

  it("formats totals and links", () => {
    expect(chapterTitleFromSlug("3.2-why-caches-help")).toBe("Why caches help");
    expect(formatListenTotal(40)).toBe("40 min");
    expect(formatListenTotal(60)).toBe("1 hour");
    expect(formatListenTotal(155)).toBe("2.5 hours");
    expect(listenHref("collaboration", "1-1-set-the-scene")).toBe("/courses/collaboration/1-1-set-the-scene#listen");
  });
});

describe("course categories", () => {
  it("has a catalog tile for every category, Cloud and DevOps included", () => {
    expect(COURSE_CATEGORY_INFO.map((c) => c.value).sort()).toEqual([...COURSE_CATEGORIES].sort());
    expect(categoryFromParam("cloud-devops")).toBe("CLOUD_DEVOPS");
    expect(COURSE_CATEGORY_INFO.find((c) => c.value === "CLOUD_DEVOPS")?.label).toBe("Cloud and DevOps");
  });
});
