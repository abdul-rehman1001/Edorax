/**
 * Resolves which course under courses/ a content script works on.
 *
 * Pass `--course <slug>` (or `--course=<slug>`); the default is the FreshMarket
 * course so existing commands behave as before. A course folder can carry a
 * `course.yaml` with the course metadata and its planned modules and lessons.
 * Legacy folders without a manifest fall back to SEED_COURSE plus the module
 * names in import-course.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import { COURSE_CATEGORY_SOURCE_VALUES } from "../src/shared/domain/enums.js";
import { findCourseFamily } from "../src/shared/lib/course-tracks.js";
import { isSafeProductName } from "../src/shared/lib/content-tokens.js";
import { ASSISTANT_GUIDANCE_MAX, ASSISTANT_STARTERS_MAX, ASSISTANT_STARTER_MAX, assistantEfforts } from "../src/services/ai/chapter-qa/assistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COURSE_SLUG = "multi-vendor-marketplace";
const SERVER_ROOT = path.resolve(__dirname, "..");

/** Support a root checkout and Heroku's APP_BASE=server slug layout. */
export function coursesRootForServer(serverRoot: string): string {
  // A private content checkout can live anywhere on the build or publishing host.
  // The public platform checkout has no courses/ directory.
  if (process.env.BUILDMENT_CONTENT_ROOT) {
    return path.resolve(process.env.BUILDMENT_CONTENT_ROOT, "courses");
  }
  const nested = path.join(serverRoot, "courses");
  return fs.existsSync(path.join(nested, "publishing.yaml"))
    ? nested
    : path.resolve(serverRoot, "../courses");
}

const COURSES_ROOT = coursesRootForServer(SERVER_ROOT);

function courseSlugFromArgs(argv: string[]): string {
  const index = argv.indexOf("--course");
  const inline = argv.find((arg) => arg.startsWith("--course="));
  const slug = index >= 0 ? argv[index + 1] : inline?.slice("--course=".length);
  if (slug === undefined) return DEFAULT_COURSE_SLUG;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`--course expects a kebab-case folder name under courses/, got "${slug}"`);
  }
  return slug;
}

export const COURSE_SLUG = courseSlugFromArgs(process.argv);
// ZIP validation runs the same scripts against an isolated temporary folder.
export const COURSE_SOURCE_DIR = process.env.COURSE_IMPORT_SOURCE ?? path.join(COURSES_ROOT, COURSE_SLUG);
export const COURSE_MANIFEST_PATH = path.join(COURSE_SOURCE_DIR, "course.yaml");

const PlannedLessonSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Use a stable kebab-case lesson key").optional(),
  file: z.string().regex(/^\d+\.\d+-[a-z0-9-]+\.md$/, "Lesson files look like 01.02-some-slug.md"),
  title: z.string().min(1),
  goal: z.string().min(1),
});

const PlannedModuleSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, "Use a stable kebab-case module key").optional(),
  dir: z.string().regex(/^\d+-[a-z0-9-]+$/, "Module folders look like 01-some-slug"),
  title: z.string().min(1),
  summary: z.string().optional(),
  lessons: z.array(PlannedLessonSchema).min(1),
});

const VariantModuleSchema = PlannedModuleSchema.extend({
  key: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  lessons: z.array(PlannedLessonSchema.extend({
    key: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  })).min(1),
});

const VariantOverrideSchema = z.object({
  lessonKey: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  // A complete replacement chapter, or exact text replacements within the shared chapter.
  file: z.string().regex(/^variants\/[a-z0-9-]+\/\d+-[a-z0-9-]+\/\d+\.\d+-[a-z0-9-]+\.md$/).optional(),
  replacements: z.array(z.object({ from: z.string().min(1), to: z.string() })).optional(),
}).refine(value => Boolean(value.file) !== Boolean(value.replacements?.length), "Use either a chapter file or text replacements");

export const CourseManifestSchema = z.object({
  slug: z.string(),
  /** Repository publishing requires this explicit intent; dashboard ZIPs may omit it. */
  publication: z.enum(["create", "update"]).optional(),
  creatorEmail: z.email().optional(),
  /** Opt in to publishing this repository package after CI passes on main. */
  repositoryPublish: z.boolean().optional(),
  /** Existing database slug when an older course was first published under a different name. */
  repositoryTargetSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  /** Existing lesson punctuation and quiz explanations are migrated without rewriting learner content. */
  legacySourceAudit: z.boolean().optional(),
  /** Explicit publication exception for content still below the editorial audit bar. */
  repositoryEditorialAudit: z.enum(["required", "advisory"]).default("required"),
  title: z.string().min(1),
  description: z.string().min(1),
  projectGoal: z.string().min(1),
  difficulty: z.enum(["Beginner", "Medium", "Advanced"]),
  estimatedHours: z.number().int().positive(),
  /** Catalog grouping: "tech" (default), "soft-skills" or "cloud-devops". */
  category: z.enum(COURSE_CATEGORY_SOURCE_VALUES).default("tech"),
  coverUrl: z.string().url().optional(),
  /**
   * Opt in to listen-along audio. `agent-ip/scripts/narrate/narrate.py` reads this block and
   * writes the audio and a manifest the reader uses; chapters are file names without `.md`.
   */
  narration: z.object({
    voice: z.string().min(1).default("af_heart"),
    speed: z.number().min(0.7).max(1.2).default(0.95),
    chapters: z.array(z.string().regex(/^\d+\.\d+-[a-z0-9-]+$/, "Use the chapter file name without .md, for example 01.02-roles")).min(1),
    /** Words the voice gets wrong, mapped to a spelling it says correctly. */
    pronunciations: z.record(z.string().min(1), z.string().min(1)).default({}),
  }).optional(),
  /**
   * Settings for the "Ask about this chapter" tutor in every chapter of this course. The platform
   * rules always come first; guidance is added after them and can only narrow what the tutor does.
   */
  assistant: z.object({
    /** How much the model thinks before it answers: low is fastest and cheapest. */
    effort: z.enum(assistantEfforts).default("low"),
    guidance: z.string().trim().min(1).max(ASSISTANT_GUIDANCE_MAX).optional(),
    /** Short questions offered as one-tap chips in every chapter. */
    starters: z.array(z.string().trim().min(3).max(ASSISTANT_STARTER_MAX)).max(ASSISTANT_STARTERS_MAX).optional(),
  }).strict().optional(),
  /**
   * Branded diagrams written as ```flow and ```sequence fences (docs/diagram-components-plan.md).
   * `pnpm diagrams:export --course <slug>` writes a static SVG of each one when exportSvg is on,
   * for email, PDF and social posts. The course audit flags ```mermaid fences when flagMermaid is on.
   */
  diagrams: z.object({
    exportSvg: z.boolean().default(false),
    /** Exported files use the wide layout or the phone one (a flow top to bottom, numbered messages). */
    layout: z.enum(["wide", "compact"]).default("wide"),
    flagMermaid: z.boolean().default(true),
  }).strict().optional(),
  /** Built-in family slug or the slug of variantFamily below. */
  family: z.string().optional(),
  /** Explicitly released tracks. Omit for the historical all-variants behavior. */
  availableVariantSlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).optional(),
  variantFamily: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().min(1),
    defaultVariantSlug: z.string().min(1),
    variants: z.array(z.object({
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), label: z.string().min(1),
      productName: z.string().refine(isSafeProductName, "Use a plain product name without Markdown, quotes, or angle brackets"),
      summary: z.string().min(1), hardestConstraint: z.string().min(1),
      channels: z.array(z.object({ label: z.string().min(1).max(40), optional: z.boolean().optional() })).max(6).optional(),
      specialisationSlug: z.string().default(""),
      theme: z.object({ accentLight: z.string().regex(/^#[0-9A-Fa-f]{6}$/), onAccentLight: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        accentDark: z.string().regex(/^#[0-9A-Fa-f]{6}$/), onAccentDark: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        headingFont: z.enum(["sans", "serif"]) }).default({ accentLight: "#1D4ED8", onAccentLight: "#FFFFFF",
        accentDark: "#93C5FD", onAccentDark: "#0B1B3A", headingFont: "sans" }),
    })).min(2),
    specialisations: z.array(z.object({ slug: z.string(), label: z.string(), summary: z.string() })).default([]),
  }).optional(),
  modules: z.array(PlannedModuleSchema),
  variants: z.array(z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    overrides: z.array(VariantOverrideSchema).default([]),
    /** Complete variant-only modules, stored under variants/<slug>/<dir>/. */
    modules: z.array(VariantModuleSchema).default([]),
    /** Shared lessons omitted from this variant's otherwise inherited modules. */
    omitLessonKeys: z.array(z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)).default([]),
    /** Complete ordered module path for this variant; absent shared keys are omitted. */
    moduleOrder: z.array(z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)).min(1).optional(),
  })).optional(),
  remove: z.object({ moduleKeys: z.array(z.string()).default([]), lessonKeys: z.array(z.string()).default([]) }).optional(),
}).superRefine((manifest, ctx) => {
  if (manifest.legacySourceAudit && !manifest.repositoryTargetSlug) {
    ctx.addIssue({ code: "custom", path: ["legacySourceAudit"], message: "Legacy audit exception requires an existing repository target slug" });
  }
  if (!manifest.modules.length && !manifest.remove?.moduleKeys.length && !manifest.remove?.lessonKeys.length &&
      !manifest.variants?.some(variant => variant.overrides.length || variant.modules.length || variant.omitLessonKeys.length || variant.moduleOrder)) {
    ctx.addIssue({ code: "custom", path: ["modules"], message: "Provide lessons, variant overrides, or explicit removals" });
  }
  if (manifest.publication === "create" && !manifest.modules.length) {
    ctx.addIssue({ code: "custom", path: ["modules"], message: "A new course needs at least one module" });
  }
  if (manifest.family && !findCourseFamily(manifest.family) && manifest.variantFamily?.slug !== manifest.family) {
    ctx.addIssue({ code: "custom", path: ["family"], message: "family must name a built-in family or match variantFamily.slug" });
  }
  if (manifest.variantFamily) {
    if (manifest.family !== manifest.variantFamily.slug) ctx.addIssue({ code: "custom", path: ["variantFamily"], message: "variantFamily.slug must match family" });
    const slugs = manifest.variantFamily.variants.map(variant => variant.slug);
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: "custom", path: ["variantFamily", "variants"], message: "Variant slugs must be unique" });
    if (!slugs.includes(manifest.variantFamily.defaultVariantSlug)) ctx.addIssue({ code: "custom", path: ["variantFamily", "defaultVariantSlug"], message: "Default variant must exist" });
  }
  const modules = new Set<string>();
  const lessons = new Set<string>();
  for (const [mi, module] of manifest.modules.entries()) {
    if (module.key) {
      if (modules.has(module.key)) ctx.addIssue({ code: "custom", path: ["modules", mi, "key"], message: "Module key must be unique in this course" });
      modules.add(module.key);
    }
    for (const [li, lesson] of module.lessons.entries()) {
      if (!lesson.key) continue;
      if (lessons.has(lesson.key)) ctx.addIssue({ code: "custom", path: ["modules", mi, "lessons", li, "key"], message: "Lesson key must be unique in this course" });
      lessons.add(lesson.key);
    }
  }
  const allModuleKeys = new Set(modules);
  const allLessonKeys = new Set(lessons);
  const family = manifest.variantFamily ?? findCourseFamily(manifest.family);
  if (manifest.availableVariantSlugs) {
    if (!family) ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: "A variant family is required" });
    else {
      if (!manifest.availableVariantSlugs.includes(family.defaultVariantSlug)) {
        ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: "Include the family default variant" });
      }
      for (const slug of manifest.availableVariantSlugs) if (!family.variants.some(variant => variant.slug === slug)) {
        ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: `Unknown family variant ${slug}` });
      }
      for (const slug of manifest.availableVariantSlugs) if (slug !== family.defaultVariantSlug &&
        !manifest.variants?.some(variant => variant.slug === slug && (variant.overrides.length || variant.modules.length))) {
        ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: `Available variant ${slug} needs authored variant lessons` });
      }
      for (const slug of manifest.availableVariantSlugs) if (slug !== family.defaultVariantSlug &&
        !manifest.variants?.some(variant => variant.slug === slug && variant.moduleOrder)) {
        ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: `Available variant ${slug} needs its complete moduleOrder` });
      }
      if (new Set(manifest.availableVariantSlugs).size !== manifest.availableVariantSlugs.length) {
        ctx.addIssue({ code: "custom", path: ["availableVariantSlugs"], message: "Variant slugs must be unique" });
      }
    }
  }
  const variants = new Set<string>();
  for (const [vi, variant] of (manifest.variants ?? []).entries()) {
    if (!family || !family.variants.some(item => item.slug === variant.slug)) ctx.addIssue({ code: "custom", path: ["variants", vi, "slug"], message: "Variant must exist in the selected course family" });
    if (variants.has(variant.slug)) ctx.addIssue({ code: "custom", path: ["variants", vi, "slug"], message: "Duplicate variant" });
    variants.add(variant.slug);
    const overridden = new Set<string>();
    const overrideFiles = new Set<string>();
    for (const [oi, override] of variant.overrides.entries()) {
      if (overridden.has(override.lessonKey)) ctx.addIssue({ code: "custom", path: ["variants", vi, "overrides", oi], message: "Duplicate lesson override" });
      overridden.add(override.lessonKey);
      if (override.file && !override.file.startsWith(`variants/${variant.slug}/`)) ctx.addIssue({ code: "custom", path: ["variants", vi, "overrides", oi, "file"], message: "Override file must belong to its variant" });
      if (override.file && overrideFiles.has(override.file)) ctx.addIssue({ code: "custom", path: ["variants", vi, "overrides", oi, "file"], message: "Override files must be unique" });
      if (override.file) overrideFiles.add(override.file);
      if (!lessons.has(override.lessonKey)) ctx.addIssue({ code: "custom", path: ["variants", vi, "overrides", oi, "lessonKey"], message: `Unknown shared lesson key ${override.lessonKey}` });
    }
    if (variant.modules.length && !variant.moduleOrder) ctx.addIssue({ code: "custom", path: ["variants", vi, "moduleOrder"], message: "Variant-only modules need a complete moduleOrder" });
    const knownOrderKeys = new Set([...modules, ...variant.modules.map(module => module.key)]);
    if (variant.moduleOrder) {
      const ordered = new Set(variant.moduleOrder);
      if (ordered.size !== variant.moduleOrder.length) ctx.addIssue({ code: "custom", path: ["variants", vi, "moduleOrder"], message: "Module order has duplicate keys" });
      for (const key of ordered) if (!knownOrderKeys.has(key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "moduleOrder"], message: `Unknown module key ${key}` });
      for (const module of variant.modules) if (!ordered.has(module.key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "moduleOrder"], message: `Variant module ${module.key} is missing from moduleOrder` });
      for (const override of variant.overrides) {
        const parent = manifest.modules.find(module => module.lessons.some(lesson => lesson.key === override.lessonKey));
        if (parent?.key && !ordered.has(parent.key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "moduleOrder"], message: `Override ${override.lessonKey} targets an omitted module` });
      }
    }
    if (new Set(variant.omitLessonKeys).size !== variant.omitLessonKeys.length) ctx.addIssue({ code: "custom", path: ["variants", vi, "omitLessonKeys"], message: "Omitted lesson keys must be unique" });
    for (const key of variant.omitLessonKeys) {
      if (!lessons.has(key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "omitLessonKeys"], message: `Unknown shared lesson key ${key}` });
      if (overridden.has(key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "omitLessonKeys"], message: `Cannot omit and override lesson ${key}` });
    }
    const variantDirs = new Set<string>();
    for (const [mi, module] of variant.modules.entries()) {
      if (variantDirs.has(module.dir)) ctx.addIssue({ code: "custom", path: ["variants", vi, "modules", mi, "dir"], message: `Duplicate variant module directory ${module.dir}` });
      variantDirs.add(module.dir);
      if (variant.overrides.some(override => override.file?.startsWith(`variants/${variant.slug}/${module.dir}/`))) {
        ctx.addIssue({ code: "custom", path: ["variants", vi, "modules", mi, "dir"], message: "Variant-only module folder cannot also hold shared lesson overrides" });
      }
      if (allModuleKeys.has(module.key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "modules", mi, "key"], message: `Module key ${module.key} is already used` });
      allModuleKeys.add(module.key);
      for (const lesson of module.lessons) {
        if (lesson.file.split(".")[0] !== module.dir.split("-")[0]) {
          ctx.addIssue({ code: "custom", path: ["variants", vi, "modules", mi, "lessons"], message: `${lesson.file} must use module number ${module.dir.split("-")[0]}` });
        }
        if (allLessonKeys.has(lesson.key)) ctx.addIssue({ code: "custom", path: ["variants", vi, "modules", mi, "lessons"], message: `Lesson key ${lesson.key} is already used` });
        allLessonKeys.add(lesson.key);
      }
    }
  }
  for (const key of manifest.remove?.moduleKeys ?? []) if (modules.has(key)) ctx.addIssue({ code: "custom", path: ["remove", "moduleKeys"], message: `Cannot remove and update module ${key}` });
  for (const key of manifest.remove?.lessonKeys ?? []) if (lessons.has(key)) ctx.addIssue({ code: "custom", path: ["remove", "lessonKeys"], message: `Cannot remove and update lesson ${key}` });
  for (const field of ["moduleKeys", "lessonKeys"] as const) {
    const keys = manifest.remove?.[field] ?? [];
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["remove", field], message: "Removal keys must be unique" });
  }
  for (const variant of manifest.variants ?? []) for (const override of variant.overrides) {
    if (manifest.remove?.lessonKeys.includes(override.lessonKey)) {
      ctx.addIssue({ code: "custom", path: ["variants", variant.slug], message: `Cannot override and remove lesson ${override.lessonKey}` });
    }
  }
});

export type CourseManifest = z.infer<typeof CourseManifestSchema>;

/** The parsed course.yaml, or null for a course without one (FreshMarket). Throws if it is invalid. */
export function loadCourseManifest(): CourseManifest | null {
  if (!fs.existsSync(COURSE_SOURCE_DIR)) {
    throw new Error(`No course folder at ${COURSE_SOURCE_DIR}/`);
  }
  if (!fs.existsSync(COURSE_MANIFEST_PATH)) return null;
  const raw = loadYaml(fs.readFileSync(COURSE_MANIFEST_PATH, "utf8"));
  const result = CourseManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    throw new Error(`course.yaml is invalid: ${issues.join("; ")}`);
  }
  if (result.data.slug !== COURSE_SLUG) {
    throw new Error(`course.yaml slug "${result.data.slug}" must match its folder name "${COURSE_SLUG}"`);
  }
  return result.data;
}
