/** Publish explicitly opted-in repository courses through the reviewed ZIP release path.
 *
 * --check validates packages without a database connection.
 * --count prints the number of opted-in packages for CI.
 * --publish validates every package before changing any course, then publishes
 * each package through the same services as the mentor ZIP workflow.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";
import { z } from "zod";
import { CourseManifestSchema, coursesRootForServer } from "./course-source.js";
import { courseCategoryFromSource, type CourseCategory } from "../src/shared/domain/enums.js";
import { findCourseFamily } from "../src/shared/lib/course-tracks.js";
import type { Prisma } from "../src/generated/prisma/index.js";
import type { SessionUser } from "../src/types/auth.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COURSES_ROOT = coursesRootForServer(SERVER_ROOT);
const REPO_ROOT = path.dirname(COURSES_ROOT);
const ZIP_FILE = /^(?:variants\/[a-z0-9-]+\/)?\d+-[a-z0-9-]+\/\d+\.\d+-[a-z0-9-]+\.md$/;

type Package = { slug: string; dir: string; manifest: ReturnType<typeof CourseManifestSchema.parse> };

const PublishingSettings = z.object({ instructorEmail: z.email() });

export function publishingSettings(root = COURSES_ROOT) {
  return PublishingSettings.parse(loadYaml(fs.readFileSync(path.join(root, "publishing.yaml"), "utf8")));
}

export function selectedPackages(root = COURSES_ROOT): Package[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dir = path.join(root, entry.name);
      const manifestPath = path.join(dir, "course.yaml");
      if (!fs.existsSync(manifestPath)) return null;
      const raw = loadYaml(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown> | null;
      if (!raw?.repositoryPublish) return null;
      const manifest = CourseManifestSchema.parse(raw);
      if (manifest.slug !== entry.name) throw new Error(`${manifestPath}: slug must match the folder name`);
      if (manifest.slug === "multi-vendor-marketplace") {
        const family = findCourseFamily(manifest.family);
        const missing = family?.variants.map(variant => variant.slug)
          .filter(slug => !manifest.availableVariantSlugs?.includes(slug)) ?? [];
        if (!family || missing.length) {
          throw new Error(`${manifestPath}: all marketplace variants must be available before repository publishing; missing ${missing.join(", ") || "family"}`);
        }
      }
      return { slug: entry.name, dir, manifest };
    })
    .filter((item): item is Package => item !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function ownershipSlugGroups(packages: Package[]): string[][] {
  return packages.map(pkg => [pkg.slug, ...(pkg.manifest.repositoryTargetSlug ? [pkg.manifest.repositoryTargetSlug] : [])]);
}

function filesForZip(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  function visit(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Course package contains a symlink: ${full}`);
      if (entry.isDirectory()) { visit(full); continue; }
      if (!entry.isFile()) throw new Error(`Unsupported course package entry: ${full}`);
      const relative = path.relative(dir, full).split(path.sep).join("/");
      if (relative !== "course.yaml" && relative !== "COURSE-OUTLINE.md" && !ZIP_FILE.test(relative)) {
        throw new Error(`Unsupported course package file: ${relative}`);
      }
      files[relative] = fs.readFileSync(full);
    }
  }
  visit(dir);
  if (Object.keys(files).length > 3000) throw new Error("Course package exceeds 3,000 files");
  const bytes = Object.values(files).reduce((sum, file) => sum + file.length, 0);
  if (bytes > 40 * 1024 * 1024) throw new Error("Course package exceeds 40 MB expanded");
  return files;
}

export function courseSourceHash(pkg: Package): string {
  const digest = createHash("sha256");
  for (const [name, bytes] of Object.entries(filesForZip(pkg.dir)).sort(([a], [b]) => a.localeCompare(b))) {
    digest.update(name).update("\0").update(bytes).update("\0");
  }
  return digest.digest("hex");
}

type CourseDetails = { title: string; description: string | null; projectGoal: string | null; difficulty: string | null;
  estimatedHours: number | null; category: CourseCategory; coverUrl: string | null; assistant: unknown };

// The repository owns a published course's details, so a publish copies them from course.yaml.
// ZIP updates leave details alone, which kept an early preview's title on System Design.
export function courseDetailsUpdate(manifest: Package["manifest"], current: CourseDetails): Partial<CourseDetails> | null {
  const wanted: Partial<CourseDetails> = {
    title: manifest.title, description: manifest.description, projectGoal: manifest.projectGoal,
    difficulty: manifest.difficulty, estimatedHours: manifest.estimatedHours,
    category: courseCategoryFromSource(manifest.category),
    // No cover in the source keeps whatever cover the course has.
    ...(manifest.coverUrl ? { coverUrl: manifest.coverUrl } : {}),
    // Tutor settings are a JSON column, so they compare by value; no block clears whatever is stored.
    assistant: manifest.assistant ?? null,
  };
  const changed = Object.fromEntries(Object.entries(wanted).filter(([key, value]) =>
    JSON.stringify(current[key as keyof CourseDetails] ?? null) !== JSON.stringify(value)));
  return Object.keys(changed).length ? changed : null;
}

export function packageZip(pkg: Package, publication: "create" | "update", instructorEmail: string): Buffer {
  const files = filesForZip(pkg.dir);
  // The database decides create versus update. Keep the reviewed source manifest
  // unchanged; only the action hint in the transport ZIP is set here.
  files["course.yaml"] = Buffer.from(dumpYaml({ ...pkg.manifest, slug: pkg.manifest.repositoryTargetSlug ?? pkg.slug,
    publication, creatorEmail: instructorEmail }), "utf8");
  const zip = Buffer.from(zipSync(files, { level: 6 }));
  if (zip.length > 15 * 1024 * 1024) throw new Error(`${pkg.slug}: repository ZIP exceeds the 15 MB import limit`);
  return zip;
}

function validate(pkg: Package, instructorEmail: string) {
  if (pkg.manifest.creatorEmail && pkg.manifest.creatorEmail.toLowerCase() !== instructorEmail.toLowerCase()) {
    throw new Error(`${pkg.slug}: creatorEmail conflicts with courses/publishing.yaml`);
  }
  packageZip(pkg, "create", instructorEmail);
  const env = { ...process.env };
  delete env.COURSE_IMPORT_SOURCE;
  delete env.COURSE_IMPORT_RESULT;
  const run = (file: string, args: string[], cwd = SERVER_ROOT) => {
    execFileSync(process.execPath, ["--import", "tsx", file, ...args], { cwd, env, stdio: "inherit", timeout: 180000 });
  };
  run("scripts/validate-course-source.ts", ["--course", pkg.slug]);
  run("scripts/audit-course-structure.ts", ["--course", pkg.slug, "--strict"]);
  if (pkg.slug === "multi-vendor-marketplace") {
    run("scripts/audit-marketplace-inheritance.ts", ["--course", pkg.slug]);
    execFileSync(process.execPath, ["agent-ip/scripts/audit-variant-repetition.mjs",
      path.join("courses", pkg.slug, "variants")], { cwd: REPO_ROOT, env, stdio: "inherit", timeout: 180000 });
  }
  const auditArgs = ["agent-ip/scripts/audit-course.mjs", path.join("courses", pkg.slug)];
  if (pkg.manifest.repositoryEditorialAudit === "required") {
    execFileSync(process.execPath, auditArgs, { cwd: REPO_ROOT, env, stdio: "inherit", timeout: 180000 });
  } else {
    const audit = spawnSync(process.execPath, auditArgs, {
      cwd: REPO_ROOT, env, encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024,
    });
    if (audit.error || (audit.status !== 0 && audit.status !== 1)) {
      throw audit.error ?? new Error(`${pkg.slug}: editorial audit could not run: ${audit.stderr}`);
    }
    const summary = audit.stdout.match(/Chapters: \d+\nProse words: \d+\nNeeds work: \d+/)?.[0];
    if (!summary) throw new Error(`${pkg.slug}: editorial audit ended without a results summary: ${audit.stderr}`);
    console.log(`${pkg.slug}: editorial audit is advisory under an explicit publication exception. ${summary.replaceAll("\n", ", ")}`);
  }
}

async function publish(packages: Package[], instructorEmail: string) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured in the backend release environment");
  const { prisma } = await import("../src/db/prisma.js");
  const { Prisma } = await import("../src/generated/prisma/index.js");
  const { importCourseZip } = await import("../src/services/teach/course-import.js");
  const { previewCourseZipUpdate, approveCourseZipUpdate } = await import("../src/services/teach/course-update.js");
  const { publishCourse } = await import("../src/services/teach/courses.js");
  try {
    const owner = await prisma.user.findUnique({ where: { email: instructorEmail },
      select: { id: true, email: true, name: true, image: true, role: true, emailVerified: true, zipImportEnabled: true, testerEnabled: true } });
    if (!owner || !["MENTOR", "ADMIN"].includes(owner.role) || !owner.emailVerified || !owner.zipImportEnabled) {
      throw new Error(`${instructorEmail} must be a verified instructor with ZIP import access before repository publishing runs`);
    }
    const user: SessionUser = owner;
    // Bind only opted-in repository courses. The previous owner keeps
    // COURSE_CREATOR access; unpublished source packages must not mutate DB ownership.
    for (const slugs of ownershipSlugGroups(packages)) {
      const courses = await prisma.course.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, mentorId: true } });
      for (const course of courses) {
        if (course.mentorId === user.id) continue;
        await prisma.$transaction(async tx => {
          await tx.courseInstructor.upsert({
            where: { courseId_userId: { courseId: course.id, userId: course.mentorId } },
            update: { role: "COURSE_CREATOR" },
            create: { courseId: course.id, userId: course.mentorId, role: "COURSE_CREATOR" },
          });
          await tx.courseInstructor.deleteMany({ where: { courseId: course.id, userId: user.id } });
          const changed = await tx.course.updateMany({ where: { id: course.id, mentorId: course.mentorId }, data: { mentorId: user.id } });
          if (changed.count !== 1) throw new Error(`${course.slug}: course ownership changed during binding; retry the workflow`);
        });
        console.log(`${course.slug}: assigned course ownership to ${instructorEmail}`);
      }
    }
    for (const pkg of packages) {
      const targetSlug = pkg.manifest.repositoryTargetSlug ?? pkg.slug;
      const sourceHash = courseSourceHash(pkg);
      const prior = await prisma.course.findUnique({ where: { slug: targetSlug }, select: {
        id: true, status: true, activeReleaseId: true, repositorySourceHash: true, repositoryReleaseId: true,
        title: true, description: true, projectGoal: true, difficulty: true, estimatedHours: true, category: true, coverUrl: true, assistant: true,
      } });
      const details = prior ? courseDetailsUpdate(pkg.manifest, prior) : null;
      if (prior && details) {
        await prisma.course.update({ where: { id: prior.id }, data: { ...details,
          ...("assistant" in details ? { assistant: details.assistant ?? Prisma.DbNull } : {}) } as Prisma.CourseUpdateInput });
        console.log(`${pkg.slug}: course details updated (${Object.keys(details).join(", ")})`);
      }
      if (prior?.status === "PUBLISHED" && prior.repositorySourceHash === sourceHash &&
          prior.repositoryReleaseId === prior.activeReleaseId) {
        console.log(`${pkg.slug}: repository package is already current`);
        continue;
      }
      const zip = packageZip(pkg, prior ? "update" : "create", instructorEmail);
      const hash = createHash("sha256").update(zip).digest("hex").slice(0, 12);
      if (!prior) {
        const created = await importCourseZip(user, zip, "repository");
        const course = await prisma.course.findUniqueOrThrow({ where: { slug: created.courseSlug }, select: { id: true } });
        await publishCourse(user, course.id);
        const release = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
        await prisma.course.update({ where: { id: course.id }, data: {
          repositorySourceHash: sourceHash, repositoryReleaseId: release.activeReleaseId,
        } });
        console.log(`${pkg.slug}: created and published (${hash})`);
        continue;
      }
      const preview = await previewCourseZipUpdate(user, prior.id, zip, "repository");
      console.log(`${pkg.slug}: preview ${preview.modules.length} module changes, ${preview.variants?.length ?? 0} variants (${hash})`);
      await approveCourseZipUpdate(user, prior.id, preview.previewId, "repository");
      if (prior.status !== "PUBLISHED") await publishCourse(user, prior.id);
      const after = await prisma.course.findUniqueOrThrow({ where: { id: prior.id }, select: { activeReleaseId: true } });
      await prisma.course.update({ where: { id: prior.id }, data: {
        repositorySourceHash: sourceHash, repositoryReleaseId: after.activeReleaseId,
      } });
      console.log(`${pkg.slug}: ${after.activeReleaseId === prior.activeReleaseId ? "already current" : "new release published"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (!["--check", "--count", "--publish"].includes(mode ?? "") || rest.length) {
    throw new Error("Usage: repository-course-publish.ts --check | --count | --publish");
  }
  if (!fs.existsSync(COURSES_ROOT)) {
    if (mode === "--publish") throw new Error("Set BUILDMENT_CONTENT_ROOT to a private Buildment-core checkout before publishing courses.");
    if (process.env.BUILDMENT_CONTENT_ROOT) {
      throw new Error(`Private course checkout is missing at ${COURSES_ROOT}. Check BUILDMENT_CONTENT_ROOT.`);
    }
    if (mode === "--count") console.log(0);
    else console.log("No private course checkout configured; platform is ready for content publishing.");
    return;
  }
  const { instructorEmail } = publishingSettings();
  const packages = selectedPackages();
  if (mode === "--count") { console.log(packages.length); return; }
  for (const pkg of packages) validate(pkg, instructorEmail);
  if (mode === "--publish") await publish(packages, instructorEmail);
  else console.log(`Validated ${packages.length} opted-in course package(s).`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch(error => { console.error(error); process.exitCode = 1; });
