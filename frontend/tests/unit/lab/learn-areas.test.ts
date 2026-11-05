import { describe, expect, it } from "vitest";
import { LAB_SLUGS } from "@/shared/lab/slugs";
import { LAB_KINDS, LEARN_AREAS, VISUAL_LAB_GROUPS, areaForPath } from "@/lib/learn-areas";
import { visualLabGroups } from "@/lib/visual-labs";

describe("learner areas", () => {
  it("has unique ids and routes", () => {
    expect(new Set(LEARN_AREAS.map((a) => a.id)).size).toBe(LEARN_AREAS.length);
    expect(new Set(LEARN_AREAS.map((a) => a.href)).size).toBe(LEARN_AREAS.length);
    expect(new Set(LAB_KINDS.map((k) => k.href)).size).toBe(LAB_KINDS.length);
  });

  it("maps paths to their area", () => {
    expect(areaForPath("/catalog")?.id).toBe("courses");
    expect(areaForPath("/my-courses")?.id).toBe("courses");
    expect(areaForPath("/labs/visual/hld-visual-chat")?.id).toBe("labs");
    expect(areaForPath("/voice")?.id).toBe("voice");
    expect(areaForPath("/listen")?.id).toBe("listen");
    expect(areaForPath("/labsx")).toBeNull();
    expect(areaForPath("/dashboard")).toBeNull();
  });

  it("puts every registered lab in exactly one visual lab group", () => {
    for (const slug of LAB_SLUGS) {
      expect(VISUAL_LAB_GROUPS.filter((g) => g.prefix(slug)).map((g) => g.title), slug).toHaveLength(1);
    }
    const listed = visualLabGroups().flatMap((g) => g.labs.map((l) => l.slug));
    expect(listed.sort()).toEqual([...LAB_SLUGS].sort());
  });

  it("keeps the Docker, Kubernetes and AWS labs under Cloud and DevOps", () => {
    const cloud = visualLabGroups().find((g) => g.id === "cloud-devops")?.labs.map((l) => l.slug) ?? [];
    expect(cloud).toEqual(expect.arrayContaining(["docker-compose-stack", "k8s-web-app", "aws-web-tier"]));
    expect(new Set(VISUAL_LAB_GROUPS.map((g) => g.id)).size).toBe(VISUAL_LAB_GROUPS.length);
  });

  it("uses no em or en dashes in learner copy", () => {
    const copy = JSON.stringify([LEARN_AREAS, LAB_KINDS, VISUAL_LAB_GROUPS.map((g) => [g.title, g.description])]);
    expect(copy).not.toMatch(/[\u2013\u2014]/);
  });
});
