import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { unzipSync } from "fflate";
import { load as loadYaml } from "js-yaml";
import { courseDetailsUpdate, courseSourceHash, ownershipSlugGroups, packageZip, publishingSettings, selectedPackages } from "../../scripts/repository-course-publish.js";
import { coursesRootForServer } from "../../scripts/course-source.js";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function course(root: string, slug: string, extra = "") {
  const dir = path.join(root, slug);
  const moduleDir = path.join(dir, "01-foundations");
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "course.yaml"), `slug: ${slug}\ntitle: Example\ndescription: Example course\nprojectGoal: Learn a skill\ndifficulty: Beginner\nestimatedHours: 2\n${extra}modules:\n  - dir: 01-foundations\n    title: Foundations\n    lessons:\n      - file: 01.01-start.md\n        title: Start\n        goal: Explain the start\n`);
  fs.writeFileSync(path.join(moduleDir, "01.01-start.md"), "---\ntitle: Start\n---\nA lesson.\n");
  return dir;
}

describe("repository course publishing selection", () => {
  it("fails a configured content check when the private checkout is missing", () => {
    const missing = path.join(os.tmpdir(), `buildment-missing-${process.pid}`);
    const result = spawnSync(process.execPath,
      ["--import", "tsx", "scripts/repository-course-publish.ts", "--check"],
      { cwd: path.resolve(import.meta.dirname, "../.."), env: { ...process.env, BUILDMENT_CONTENT_ROOT: missing }, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Private course checkout is missing");
  });

  it("finds courses beside server and in an APP_BASE release slug", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-layout-"));
    temporary.push(root);
    const server = path.join(root, "server");
    const courses = path.join(root, "courses");
    fs.mkdirSync(server);
    fs.mkdirSync(courses);
    fs.writeFileSync(path.join(courses, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    expect(coursesRootForServer(server)).toBe(courses);
    expect(coursesRootForServer(root)).toBe(courses);
  });

  it("selects only opted-in packages and builds the ZIP expected by the import services", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-test-"));
    temporary.push(root);
    fs.writeFileSync(path.join(root, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    course(root, "draft");
    course(root, "ready", "repositoryPublish: true\n");
    expect(publishingSettings(root).instructorEmail).toBe("devweekends@gmail.com");
    const packages = selectedPackages(root);
    expect(packages.map(pkg => pkg.slug)).toEqual(["ready"]);
    expect(ownershipSlugGroups(packages)).toEqual([["ready"]]);
    const files = unzipSync(packageZip(packages[0]!, "update", "devweekends@gmail.com"));
    expect(Object.keys(files).sort()).toEqual(["01-foundations/01.01-start.md", "course.yaml"]);
    const manifest = loadYaml(Buffer.from(files["course.yaml"]!).toString("utf8")) as Record<string, unknown>;
    expect(manifest.publication).toBe("update");
    expect(manifest.repositoryPublish).toBe(true);
    expect(manifest.creatorEmail).toBe("devweekends@gmail.com");
    const before = courseSourceHash(packages[0]!);
    fs.appendFileSync(path.join(root, "ready", "01-foundations", "01.01-start.md"), "Another paragraph.\n");
    expect(courseSourceHash(packages[0]!)).not.toBe(before);
  });

  it("rejects a mismatched slug and refuses extra files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-test-"));
    temporary.push(root);
    const dir = course(root, "ready", "repositoryPublish: true\n");
    fs.writeFileSync(path.join(dir, "course.yaml"), fs.readFileSync(path.join(dir, "course.yaml"), "utf8").replace("slug: ready", "slug: other"));
    expect(() => selectedPackages(root)).toThrow(/slug must match/);
    fs.writeFileSync(path.join(dir, "course.yaml"), fs.readFileSync(path.join(dir, "course.yaml"), "utf8").replace("slug: other", "slug: ready"));
    fs.writeFileSync(path.join(dir, "notes.txt"), "extra");
    expect(() => packageZip(selectedPackages(root)[0]!, "create", "devweekends@gmail.com")).toThrow(/Unsupported course package file/);
  });

  it("targets the existing legacy course slug in the transport ZIP", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-target-"));
    temporary.push(root);
    const dir = course(root, "source", "repositoryPublish: true\nrepositoryTargetSlug: published-course\n");
    const selected = selectedPackages(root)[0]!;
    expect(selected.slug).toBe("source");
    expect(ownershipSlugGroups([selected])).toEqual([["source", "published-course"]]);
    const files = unzipSync(packageZip(selected, "update", "devweekends@gmail.com"));
    const manifest = loadYaml(Buffer.from(files["course.yaml"]!).toString("utf8")) as Record<string, unknown>;
    expect(manifest.slug).toBe("published-course");
    expect(manifest.publication).toBe("update");
    expect(fs.readFileSync(path.join(dir, "course.yaml"), "utf8")).toContain("slug: source");
    const createFiles = unzipSync(packageZip(selected, "create", "devweekends@gmail.com"));
    const createManifest = loadYaml(Buffer.from(createFiles["course.yaml"]!).toString("utf8")) as Record<string, unknown>;
    expect(createManifest.slug).toBe("published-course");
    expect(createManifest.publication).toBe("create");
  });

  it("keeps a partial marketplace release out of repository publishing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-marketplace-gate-"));
    temporary.push(root);
    course(root, "multi-vendor-marketplace", "repositoryPublish: true\nfamily: multi-vendor-marketplace\navailableVariantSlugs:\n  - grocery\n");
    expect(() => selectedPackages(root)).toThrow(/all marketplace variants must be available/);
  });

  it("copies changed course details from course.yaml and leaves matching ones alone", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-details-"));
    temporary.push(root);
    fs.writeFileSync(path.join(root, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    course(root, "ready", "repositoryPublish: true\ncategory: soft-skills\n");
    const manifest = selectedPackages(root)[0]!.manifest;
    const stale = { title: "Old preview title", description: "A focused preview", projectGoal: "Learn a skill",
      difficulty: "Advanced", estimatedHours: 5, category: "TECH" as const, coverUrl: "https://example.com/cover.png", assistant: null };
    expect(courseDetailsUpdate(manifest, stale)).toEqual({
      title: "Example", description: "Example course", difficulty: "Beginner", estimatedHours: 2, category: "SOFT_SKILLS",
    });
    const current = { ...stale, title: "Example", description: "Example course", difficulty: "Beginner", estimatedHours: 2, category: "SOFT_SKILLS" as const };
    expect(courseDetailsUpdate(manifest, current)).toBeNull();
  });

  it("maps category: cloud-devops in course.yaml to the Cloud and DevOps category", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-category-"));
    temporary.push(root);
    fs.writeFileSync(path.join(root, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    course(root, "ready", "repositoryPublish: true\ncategory: cloud-devops\n");
    const manifest = selectedPackages(root)[0]!.manifest;
    expect(manifest.category).toBe("cloud-devops");
    const current = { title: "Example", description: "Example course", projectGoal: "Learn a skill", difficulty: "Beginner",
      estimatedHours: 2, category: "TECH" as const, coverUrl: null, assistant: null };
    expect(courseDetailsUpdate(manifest, current)).toEqual({ category: "CLOUD_DEVOPS" });
    expect(courseDetailsUpdate(manifest, { ...current, category: "CLOUD_DEVOPS" })).toBeNull();
  });

  it("rejects a category course.yaml does not know", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-category-"));
    temporary.push(root);
    fs.writeFileSync(path.join(root, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    course(root, "ready", "repositoryPublish: true\ncategory: devops\n");
    expect(() => selectedPackages(root)).toThrow();
  });

  it("copies tutor settings by value and clears them when the source drops the block", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "buildment-course-assistant-"));
    temporary.push(root);
    fs.writeFileSync(path.join(root, "publishing.yaml"), "instructorEmail: devweekends@gmail.com\n");
    course(root, "ready", "repositoryPublish: true\n");
    const manifest = selectedPackages(root)[0]!.manifest;
    const base = { title: "Example", description: "Example course", projectGoal: "Learn a skill", difficulty: "Beginner",
      estimatedHours: 2, category: "TECH" as const, coverUrl: null };
    const withBlock = { ...manifest, assistant: { effort: "medium" as const, guidance: "Be precise." } };
    expect(courseDetailsUpdate(withBlock, { ...base, assistant: null })).toEqual({ assistant: { effort: "medium", guidance: "Be precise." } });
    expect(courseDetailsUpdate(withBlock, { ...base, assistant: { effort: "medium", guidance: "Be precise." } })).toBeNull();
    expect(courseDetailsUpdate(manifest, { ...base, assistant: { effort: "low" } })).toEqual({ assistant: null });
  });
});
