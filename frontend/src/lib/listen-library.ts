import "server-only";
import { serverApiFetch } from "@/lib/api-server";
import { NARRATION_PRODUCTION_BASE } from "@/lib/narration";
import { summarizeManifest, type ListenSummary } from "@/lib/listen-summary";
import { isSafeAssetUrl } from "@/shared/lib/asset-url";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { CourseCategory } from "@/shared/domain/enums";

// The Listen area: every published course that has listen-along audio. Course titles come from the
// catalog; the audio comes from each course's live manifest at audio.edorax.com/<course>/manifest.json,
// the same files learners hear in production. NARRATION_BASE_URL points it somewhere else, as it does
// for the reader. Local development keeps a few courses' audio in public/narration, so a chapter link
// can open a reader without a player there; production has them all.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ListenCourse = {
  slug: string;
  title: string;
  description: string | null;
  category: CourseCategory;
  summary: ListenSummary;
};

export type ListenLibrary = { courses: ListenCourse[]; catalogReachable: boolean };

export function listenManifestBase(configured: string | undefined = process.env.NARRATION_BASE_URL): string {
  const base = configured?.trim().replace(/\/+$/, "");
  return base && /^https:\/\//.test(base) && isSafeAssetUrl(base) ? base : NARRATION_PRODUCTION_BASE;
}

async function courseSummary(base: string, slug: string): Promise<ListenSummary | null> {
  if (!SLUG.test(slug)) return null;
  try {
    const response = await fetch(`${base}/${slug}/manifest.json`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? summarizeManifest(await response.json()) : null;
  } catch {
    return null;
  }
}

/** Never throws: with the API or the audio host down the page still renders, with fewer courses. */
export async function loadListenLibrary(): Promise<ListenLibrary> {
  let catalog: CatalogCourseSummary[];
  try {
    catalog = (await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog")).courses;
  } catch {
    return { courses: [], catalogReachable: false };
  }
  const base = listenManifestBase();
  const summaries = await Promise.all(catalog.map((course) => courseSummary(base, course.slug)));
  const courses = catalog.flatMap((course, i) => {
    const summary = summaries[i];
    return summary
      ? [{ slug: course.slug, title: course.title, description: course.description, category: course.category, summary }]
      : [];
  });
  return { courses, catalogReachable: true };
}
