import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { upgradeEnrollmentToRelease } from "../src/services/courses/releases.js";

// Usage: tsx scripts/migrate-user-to-latest-release.ts (--email address | --all) [--apply]
// Dry run is the default. --apply also repairs enrollments already pinned to the
// latest release by copying progress from older chapter rows when possible.
const args = process.argv.slice(2);
const emailIndex = args.indexOf("--email");
const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
const all = args.includes("--all");
const apply = args.includes("--apply");
if (all === Boolean(email) || (emailIndex >= 0 && (!email || email.startsWith("--")))) {
  console.error("Specify exactly one of --email address or --all, optionally with --apply.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      ...(email ? { user: { email } } : { chapterProgress: { some: {} } }),
      course: { activeReleaseId: { not: null } },
    },
    select: { id: true, releaseId: true, course: { select: { slug: true, activeReleaseId: true } } },
  });
  if (email && enrollments.length === 0) throw new Error(`No active-release enrollments found for ${email}`);
  console.log(`${apply ? "Applying" : "Dry run for"} ${enrollments.length} enrollment(s).`);
  for (const enrollment of enrollments) {
    const releaseId = enrollment.course.activeReleaseId;
    if (!releaseId) continue;
    console.log(`${enrollment.id} ${enrollment.course.slug}: ${enrollment.releaseId ?? "unpinned"} -> ${releaseId}`);
    if (apply) {
      await prisma.$transaction(
        (tx) => upgradeEnrollmentToRelease(tx, enrollment.id, releaseId, { repair: true }),
        { timeout: 60_000 },
      );
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
