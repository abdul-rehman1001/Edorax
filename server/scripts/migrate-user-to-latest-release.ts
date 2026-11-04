import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { recomputeEnrollmentRollup } from "../src/services/progress/compute.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const prisma = new PrismaClient({ adapter });

function cleanSlug(slug: string): string {
  // Strip release-specific hashes like --01m5pndh9050gwcdzaxc4096hp
  return slug.replace(/--[a-z0-9]+$/i, "").trim().toLowerCase();
}

async function migrateEnrollment(enrollmentId: string, dryRun: boolean) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      course: { include: { releases: { orderBy: { number: "asc" } } } },
      chapterProgress: { include: { chapter: true } },
    },
  });

  if (!enrollment) throw new Error(`Enrollment ${enrollmentId} not found`);
  const course = enrollment.course;

  if (!course.activeReleaseId) {
    console.log(`Course ${course.slug} has no activeReleaseId. Skipping.`);
    return;
  }

  const latestRelease = course.releases.find((r) => r.id === course.activeReleaseId);
  if (!latestRelease) throw new Error(`Active release ${course.activeReleaseId} not found in DB`);

  const content = latestRelease.content as any;
  const variantSlug = enrollment.variantSlug ?? "default";
  const modules = content?.variants?.[variantSlug] ?? content?.variants?.default ?? [];
  const latestChapters: Array<{ id: string; slug: string; key?: string | null; title: string; order: number }> =
    modules.flatMap((m: any) => m.chapters);

  const latestById = new Map(latestChapters.map((c) => [c.id, c]));
  const latestByCleanSlug = new Map(latestChapters.map((c) => [cleanSlug(c.slug), c]));
  const latestByKey = new Map(latestChapters.filter((c) => c.key).map((c) => [c.key!, c]));

  console.log(`\n================================================================================`);
  console.log(`Course: ${course.title} (${course.slug})`);
  console.log(`Enrollment ID: ${enrollment.id} | Dry Run: ${dryRun}`);
  console.log(`Target Latest Release: #${latestRelease.number} (${latestRelease.id})`);
  console.log(`Total chapters in latest release: ${latestChapters.length}`);
  console.log(`Current chapterProgress count: ${enrollment.chapterProgress.length}`);
  console.log(`Currently stored chaptersCompleted: ${enrollment.chaptersCompleted}, percent: ${enrollment.percentComplete}%`);

  // 1. ChapterProgress Migration
  let cpAlreadyInLatest = 0;
  let cpMatchedAndCreated = 0;
  let cpMatchedAndUpdated = 0;
  let cpUnmatched = 0;

  for (const cp of enrollment.chapterProgress) {
    if (latestById.has(cp.chapterId)) {
      cpAlreadyInLatest++;
      continue;
    }

    const oldKey = cp.chapter.contentKey;
    const oldSlug = cleanSlug(cp.chapter.slug);
    const targetChapter = (oldKey ? latestByKey.get(oldKey) : null) ?? latestByCleanSlug.get(oldSlug);

    if (!targetChapter) {
      console.log(`  [CP UNMATCHED] "${cp.chapter.title}" (slug: ${cp.chapter.slug}, id: ${cp.chapterId}) [${cp.status}]`);
      cpUnmatched++;
      continue;
    }

    console.log(`  [CP MATCH] "${cp.chapter.title}"`);
    console.log(`       Old: ${cp.chapter.slug} (${cp.chapterId}) [${cp.status}, blocks=${cp.blocksCompleted}/${cp.blocksTotal}]`);
    console.log(`    -> New: ${targetChapter.slug} (${targetChapter.id})`);

    if (!dryRun) {
      const existingTarget = await prisma.chapterProgress.findUnique({
        where: { enrollmentId_chapterId: { enrollmentId, chapterId: targetChapter.id } },
      });

      if (existingTarget) {
        const isCompleted = cp.status === "COMPLETED" || existingTarget.status === "COMPLETED";
        const newStatus = isCompleted ? "COMPLETED" : (cp.status === "IN_PROGRESS" || existingTarget.status === "IN_PROGRESS" ? "IN_PROGRESS" : "NOT_STARTED");
        await prisma.chapterProgress.update({
          where: { id: existingTarget.id },
          data: {
            status: newStatus,
            blocksCompleted: Math.max(cp.blocksCompleted, existingTarget.blocksCompleted),
            blocksTotal: Math.max(cp.blocksTotal, existingTarget.blocksTotal),
            score: Math.max(cp.score, existingTarget.score),
            maxScore: Math.max(cp.maxScore, existingTarget.maxScore),
            completedAt: existingTarget.completedAt ?? cp.completedAt,
            learningLog: existingTarget.learningLog ?? cp.learningLog ?? undefined,
          },
        });
        cpMatchedAndUpdated++;
      } else {
        await prisma.chapterProgress.create({
          data: {
            enrollmentId,
            chapterId: targetChapter.id,
            status: cp.status,
            blocksCompleted: cp.blocksCompleted,
            blocksTotal: cp.blocksTotal,
            score: cp.score,
            maxScore: cp.maxScore,
            startedAt: cp.startedAt,
            completedAt: cp.completedAt,
            learningLog: cp.learningLog ?? undefined,
          },
        });
        cpMatchedAndCreated++;
      }
    }
  }

  // 2. Response (Answers) Migration
  const responses = await prisma.response.findMany({
    where: { enrollmentId },
    include: { block: { include: { chapter: true } } },
    orderBy: { submittedAt: "asc" },
  });

  console.log(`\nResponses count: ${responses.length}`);
  let respAlreadyInLatest = 0;
  let respRemapped = 0;
  let respUnmatched = 0;

  for (const resp of responses) {
    if (latestById.has(resp.block.chapterId)) {
      respAlreadyInLatest++;
      continue;
    }

    const oldChapter = resp.block.chapter;
    const oldSlug = cleanSlug(oldChapter.slug);
    const targetChapterMeta = (oldChapter.contentKey ? latestByKey.get(oldChapter.contentKey) : null) ?? latestByCleanSlug.get(oldSlug);

    if (!targetChapterMeta) {
      console.log(`  [RESP UNMATCHED CHAPTER] Block ${resp.blockId} (${resp.block.type}) in chapter ${oldChapter.slug}`);
      respUnmatched++;
      continue;
    }

    const [oldChapterWithBlocks, targetChapterWithBlocks] = await Promise.all([
      prisma.chapter.findUnique({
        where: { id: oldChapter.id },
        include: { blocks: { orderBy: { order: "asc" } } },
      }),
      prisma.chapter.findUnique({
        where: { id: targetChapterMeta.id },
        include: { blocks: { orderBy: { order: "asc" } } },
      }),
    ]);

    if (!oldChapterWithBlocks || !targetChapterWithBlocks) {
      respUnmatched++;
      continue;
    }

    const oldBlockIndex = oldChapterWithBlocks.blocks.findIndex((b) => b.id === resp.blockId);
    const oldBlock = oldChapterWithBlocks.blocks[oldBlockIndex];

    // Find target block matching by type and relative position
    const targetBlock = targetChapterWithBlocks.blocks.find((b) => b.id === resp.blockId) ??
      targetChapterWithBlocks.blocks.find((b) => b.type === oldBlock?.type && b.order === oldBlock?.order) ??
      targetChapterWithBlocks.blocks.filter((b) => b.type === oldBlock?.type)[0] ??
      targetChapterWithBlocks.blocks[oldBlockIndex];

    if (!targetBlock) {
      console.log(`  [RESP UNMATCHED BLOCK] Block ${resp.blockId} (${oldBlock?.type}) in chapter ${oldSlug}`);
      respUnmatched++;
      continue;
    }

    console.log(`  [RESP MATCH] Response ${resp.id} (type=${resp.block.type}, score=${resp.score})`);
    console.log(`       Old Block: ${resp.blockId} (in ${oldSlug})`);
    console.log(`    -> New Block: ${targetBlock.id} (in ${targetChapterMeta.slug})`);
    respRemapped++;

    if (!dryRun) {
      const existingTargetResp = await prisma.response.findFirst({
        where: {
          blockId: targetBlock.id,
          userId: resp.userId,
          attempt: resp.attempt,
        },
      });

      if (!existingTargetResp) {
        await prisma.response.update({
          where: { id: resp.id },
          data: { blockId: targetBlock.id },
        });
      }
    }
  }

  console.log(`\n--- Summary for ${course.slug} ---`);
  console.log(`ChapterProgress: ${cpAlreadyInLatest} already latest, ${dryRun ? "would create/update" : `${cpMatchedAndCreated} created, ${cpMatchedAndUpdated} updated`}, ${cpUnmatched} unmatched`);
  console.log(`Responses: ${respAlreadyInLatest} already latest, ${dryRun ? "would remap" : `${respRemapped} remapped`}, ${respUnmatched} unmatched`);

  if (!dryRun) {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { releaseId: latestRelease.id },
    });
    await recomputeEnrollmentRollup(prisma, enrollmentId, { preserveActivity: true });

    const refreshed = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { chaptersCompleted: true, percentComplete: true, totalScore: true, status: true },
    });
    console.log(`[SUCCESS] New Rollup: chaptersCompleted=${refreshed?.chaptersCompleted}, percentComplete=${refreshed?.percentComplete}%, totalScore=${refreshed?.totalScore}, status=${refreshed?.status}`);
  }
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const emailArgIndex = process.argv.indexOf("--email");
  const targetEmail = emailArgIndex !== -1 ? process.argv[emailArgIndex + 1] : "aqibnawab1100@gmail.com";
  const runAll = process.argv.includes("--all");

  if (runAll) {
    console.log(`Starting migration for ALL active enrollments [DRY RUN = ${dryRun}]`);
    const enrollments = await prisma.enrollment.findMany({
      where: {
        chapterProgress: { some: {} },
      },
      select: { id: true, course: { select: { activeReleaseId: true } } },
    });
    console.log(`Found ${enrollments.length} enrollments with activity.`);
    for (const e of enrollments) {
      if (e.course.activeReleaseId) {
        await migrateEnrollment(e.id, dryRun);
      }
    }
  } else {
    console.log(`Starting migration for ${targetEmail} [DRY RUN = ${dryRun}]`);
    const user = await prisma.user.findFirst({ where: { email: targetEmail } });
    if (!user) throw new Error(`User with email ${targetEmail} not found`);

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: user.id },
      include: { course: true },
    });

    for (const e of enrollments) {
      if (e.course.activeReleaseId) {
        await migrateEnrollment(e.id, dryRun);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error("Migration error:", err);
  })
  .finally(() => prisma.$disconnect());
